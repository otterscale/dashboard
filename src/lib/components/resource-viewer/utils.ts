import type { JsonObject } from '@bufbuild/protobuf';

export type ResourceStatus = 'Current' | 'Ready' | 'InProgress' | 'Failed' | 'Terminating' | null;

export interface Condition {
	type: string;
	status: 'True' | 'False' | 'Unknown';
	reason?: string;
	message?: string;
}

export interface StatusResult {
	status?: ResourceStatus;
	message?: string;
	reason?: string;
}

export type ResourceObject = {
	kind?: string;
	apiVersion?: string;
	metadata?: {
		name?: string;
		namespace?: string;
		creationTimestamp?: string;
		deletionTimestamp?: string;
		generation?: number;
		resourceVersion?: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	status?: {
		observedGeneration?: number;
		conditions?: Condition[];
	};
} & JsonObject;

/**
 * Reduces an arbitrary Kubernetes resource's `status.conditions` (and a few
 * other generic metadata/status fields) into a single, coarse-grained status
 * value that can be shown consistently across unrelated resource types
 * (built-ins and CRDs alike) in a generic resource table.
 *
 * The check order and rules are based on the "generic properties" and
 * "Ready condition" layers of kstatus (sigs.k8s.io/cli-utils/pkg/kstatus/status),
 * with one deliberate deviation: a `Ready: True` condition is reported as its
 * own `Ready` status here, rather than being folded into `Current` as kstatus
 * does. This lets the UI distinguish resources that explicitly reported
 * readiness from the `Current` fallback below, which is only a guess made in
 * the absence of any recognized signal.
 *
 * Returns `null` when there is no `status.conditions` array to reason from
 * (either missing or empty). Whether that means "this resource type never
 * uses conditions" or "the controller just hasn't written any yet" cannot be
 * told apart from a single object's JSON — both cases serialize the same way
 * once `omitempty`/schema pruning strips an empty/unset field. Rather than
 * guessing, this function deliberately reports no status at all; callers
 * should render `null` as blank/unknown. If conditions later appear (e.g. on
 * the next poll), the status will resolve on its own without any special
 * handling needed here.
 *
 * NOT covered by this function (unlike full kstatus):
 * - The legacy per-type rules kstatus applies to well-known built-in kinds
 *   (Pod, Deployment, StatefulSet, Job, etc.) — those have more precise,
 *   resource-specific logic and should not rely on this generic function.
 * - Resources whose controllers don't follow the `Ready`/`Reconciling`/
 *   `Stalled` condition-type naming convention. Such resources will report
 *   `null` even if they are not actually healthy.
 */
export function computeStatus(resourceObject: ResourceObject): StatusResult | null {
	// A non-empty deletionTimestamp means the resource has been marked for
	// deletion and is waiting on finalizers to complete. This check must run
	// first, since a resource pending deletion may still carry a stale
	// `Ready: True` condition from before the delete was issued.
	if (resourceObject?.metadata?.deletionTimestamp) {
		return {
			status: 'Terminating',
			message: 'Resource scheduled for deletion',
			reason: 'DeletionTimestampSet'
		};
	}

	// If the controller hasn't yet observed the latest spec change
	// (status.observedGeneration lags behind metadata.generation), any
	// existing conditions reflect a stale state and should not be trusted
	// as "current" — surface this as InProgress before looking at conditions.
	const generation = resourceObject?.metadata?.generation;
	const observedGeneration = resourceObject.status?.observedGeneration;
	if (
		generation !== undefined &&
		observedGeneration !== undefined &&
		observedGeneration !== generation
	) {
		return {
			status: 'InProgress',
			message: `generation is ${generation}, but latest observed generation is ${observedGeneration}`,
			reason: 'LatestGenerationNotObserved'
		};
	}

	// status.conditions is optional on virtually all Kubernetes resources
	// (typically `omitempty` in the Go type or pruned by the apiserver when
	// unset). A missing array here could mean either "this resource type
	// never uses conditions" or "the controller hasn't written any yet" —
	// these are indistinguishable from a single object's JSON alone (see
	// function doc). Rather than guess, report no status.
	const conditionsField = resourceObject.status?.conditions;
	if (!Array.isArray(conditionsField) || conditionsField.length === 0) {
		return null;
	}
	const conditions = conditionsField;

	// Standard kstatus conditions, "abnormal-true" convention: present and
	// True only when something noteworthy is happening. Absence of these
	// does NOT by itself imply the resource is healthy — it may simply mean
	// the controller doesn't emit them.
	const reconciling = conditions.find(
		(condition) => condition.type === 'Reconciling' && condition.status === 'True'
	);
	if (reconciling) {
		return { status: 'InProgress', message: reconciling.message ?? '', reason: reconciling.reason };
	}
	const stalled = conditions.find(
		(condition) => condition.type === 'Stalled' && condition.status === 'True'
	);
	if (stalled) {
		return { status: 'Failed', message: stalled.message ?? '', reason: stalled.reason };
	}

	// `Ready` is not part of the official Kubernetes API conventions, but it
	// is a widely used de facto standard among CRD authors (e.g. KServe's
	// LLMInferenceService). Unlike kstatus, which folds `Ready: True` into
	// its generic `Current` status, this function reports it as a distinct
	// `Ready` value so callers can tell "explicitly confirmed ready" apart
	// from the unconfirmed `Current` fallback below.
	const ready = conditions.find((condition) => condition.type === 'Ready');
	if (ready) {
		switch (ready.status) {
			case 'True':
				return { status: 'Ready', message: 'Resource is Ready' };
			case 'False':
			case 'Unknown':
				return { status: 'InProgress', message: ready.message ?? '', reason: ready.reason };
		}
	}

	// conditions is non-empty, but contains none of the recognized types
	// (Reconciling/Stalled/Ready). The resource is clearly reporting
	// *something*, just not in a shape this function understands — Current
	// is used here as a conservative default, distinct from the `null`
	// case above where there was no signal to reason from at all.
	return {
		status: 'Current',
		message: 'No recognized conditions found; assuming resource is current',
		reason: 'NoConditionsObserved'
	};
}

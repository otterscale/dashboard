// Copyright 2019 The Kubernetes Authors.
// SPDX-License-Identifier: Apache-2.0
//
// Port of sigs.k8s.io/cli-utils/pkg/kstatus/status, generic rules only.
// Read-only: never mutates the resource passed in.

export type CoreV1ConditionStatus = 'True' | 'False' | 'Unknown' | (string & {});

export const ConditionTrue: CoreV1ConditionStatus = 'True';
export const ConditionFalse: CoreV1ConditionStatus = 'False';
export const ConditionUnknown: CoreV1ConditionStatus = 'Unknown';

export type ConditionType = 'Stalled' | 'Reconciling' | (string & {});

// Abnormality-true: only set to True when something is wrong. An absent
// condition means normal.
export const ConditionStalled: ConditionType = 'Stalled';
export const ConditionReconciling: ConditionType = 'Reconciling';

export type Status = 'InProgress' | 'Failed' | 'Current' | 'Terminating' | 'NotFound' | 'Unknown';

export const InProgressStatus: Status = 'InProgress';
export const FailedStatus: Status = 'Failed';
export const CurrentStatus: Status = 'Current';
export const TerminatingStatus: Status = 'Terminating';

// Never returned by compute(). For callers to use when a resource is missing
// or cannot be judged.
export const NotFoundStatus: Status = 'NotFound';
export const UnknownStatus: Status = 'Unknown';

// A condition produced by this package.
export interface Condition {
	type: ConditionType;
	status: CoreV1ConditionStatus;
	reason: string;
	message: string;
}

// A condition read off a resource. CRDs don't always fill these in, so reason
// and message are optional.
export interface BasicCondition {
	type: string;
	status: CoreV1ConditionStatus;
	reason?: string;
	message?: string;
	[key: string]: unknown;
}

export interface Result {
	status: Status;
	message: string;
	conditions: Condition[];
}

export type JSONObject = Record<string, unknown>;

export interface ObjectMeta {
	name?: string;
	namespace?: string;
	generation?: number;
	resourceVersion?: string;
	uid?: string;
	creationTimestamp?: string;
	deletionTimestamp?: string;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
	ownerReferences?: unknown[];
	finalizers?: string[];
	[key: string]: unknown;
}

export interface ResourceStatus {
	observedGeneration?: number;
	conditions?: BasicCondition[];
	[key: string]: unknown;
}

// Shared shape for every Kubernetes resource. Other fields are kept by the
// index signature.
export interface KubernetesResource {
	apiVersion?: string;
	kind?: string;
	metadata?: ObjectMeta;
	spec?: JSONObject;
	status?: ResourceStatus;
	[key: string]: unknown;
}

// Typed as an array, but CRD data isn't always well behaved, so guard at
// runtime too.
function conditionsOf(resource: KubernetesResource): BasicCondition[] {
	const conditions = resource.status?.conditions;
	return Array.isArray(conditions) ? conditions : [];
}

export function newReconcilingCondition(reason: string, message: string): Condition {
	return { type: ConditionReconciling, status: ConditionTrue, reason, message };
}

export function newStalledCondition(reason: string, message: string): Condition {
	return { type: ConditionStalled, status: ConditionTrue, reason, message };
}

export function newInProgressStatus(reason: string, message: string): Result {
	return {
		status: InProgressStatus,
		message,
		conditions: [newReconcilingCondition(reason, message)]
	};
}

export function newFailedStatus(reason: string, message: string): Result {
	return {
		status: FailedStatus,
		message,
		conditions: [newStalledCondition(reason, message)]
	};
}

// Current carries no condition.
export function newCurrentStatus(message: string): Result {
	return { status: CurrentStatus, message, conditions: [] };
}

// Checks the fields every resource has, plus the standard conditions.
// Returns null when it can't decide.
export function checkGenericProperties(resource: KubernetesResource): Result | null {
	const deletionTimestamp = resource.metadata?.deletionTimestamp;
	if (deletionTimestamp !== undefined && deletionTimestamp !== '') {
		return {
			status: TerminatingStatus,
			message: 'Resource scheduled for deletion',
			conditions: []
		};
	}

	const res = checkGeneration(resource);
	if (res !== null) {
		return res;
	}

	// If the controller uses the standard conditions, decide solely on those.
	for (const cond of conditionsOf(resource)) {
		if (cond.type === ConditionReconciling && cond.status === ConditionTrue) {
			return newInProgressStatus(cond.reason ?? '', cond.message ?? '');
		}
		if (cond.type === ConditionStalled && cond.status === ConditionTrue) {
			return newFailedStatus(cond.reason ?? '', cond.message ?? '');
		}
	}

	return null;
}

// Checks that the controller has observed the latest generation. Skipped when
// either field is absent.
export function checkGeneration(resource: KubernetesResource): Result | null {
	const generation = resource.metadata?.generation;
	if (generation === undefined) {
		return null;
	}

	const observedGeneration = resource.status?.observedGeneration;
	if (observedGeneration === undefined) {
		return null;
	}

	if (observedGeneration !== generation) {
		const kind = resource.kind ?? '';
		const message = `${kind} generation is ${generation}, but latest observed generation is ${observedGeneration}`;
		return {
			status: InProgressStatus,
			message,
			conditions: [newReconcilingCondition('LatestGenerationNotObserved', message)]
		};
	}
	return null;
}

// Ready doesn't follow the Kubernetes design recommendations, but it's widely
// used, so it serves as a last-resort fallback. Two limits: a resource that
// only sets Ready once it's True is indistinguishable from one that doesn't
// use it at all, and Ready=False can't tell "still working" from "doomed".
export function checkReadyCondition(resource: KubernetesResource): Result | null {
	for (const cond of conditionsOf(resource)) {
		if (cond.type !== 'Ready') {
			continue;
		}
		switch (cond.status) {
			case ConditionTrue:
				return newCurrentStatus('Resource is Ready');
			case ConditionFalse:
				return newInProgressStatus(cond.reason ?? '', cond.message ?? '');
			case ConditionUnknown:
				return newInProgressStatus(cond.reason ?? '', cond.message ?? '');
			default:
				break;
		}
	}
	return null;
}

// Signature for custom per-type rules. None are built in.
export type GetConditionsFn = (resource: KubernetesResource) => Result;

// Computes the status of a resource. The resource must carry its full status;
// nothing is fetched from the cluster.
//
// Order: generic properties -> Ready fallback -> Current if undecided.
//
// Note that built-in workloads (Deployment, Pod, ...) set none of the
// conditions above, so a rolling Deployment or a Pending Pod comes back as
// Current.
export function compute(resource: KubernetesResource): Result {
	const res = checkGenericProperties(resource);
	if (res !== null) {
		return res;
	}

	const readyRes = checkReadyCondition(resource);
	if (readyRes !== null) {
		return readyRes;
	}

	return newCurrentStatus('Resource is current');
}

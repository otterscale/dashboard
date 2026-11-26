/**
 * Whether each workload in a Workspace is failing, starting or ready, from the objects the
 * Resource API lists. Pods are tied to a workload with the rules the resource page's Related
 * Resources section uses: an LLMInferenceService's pods carry its name as a label, a
 * HelmRelease's workloads are in its `status.inventory`, and a Deployment or StatefulSet owns
 * its pods (a Deployment through a ReplicaSet).
 */

type Condition = { type?: string; status?: string; reason?: string };
type ContainerStatus = {
	name?: string;
	restartCount?: number;
	state?: { waiting?: { reason?: string } };
	lastState?: { terminated?: { reason?: string; finishedAt?: string } };
};
type OwnerReference = { kind?: string; name?: string };
type Metadata = {
	name?: string;
	labels?: Record<string, string>;
	ownerReferences?: OwnerReference[];
};

export type PodObject = {
	metadata?: Metadata;
	status?: {
		phase?: string;
		initContainerStatuses?: ContainerStatus[];
		containerStatuses?: ContainerStatus[];
	};
};

export type ConditionedObject = {
	metadata?: Metadata;
	status?: { conditions?: Condition[] };
};

export type ReplicatedObject = {
	metadata?: Metadata;
	spec?: { replicas?: number };
	status?: { readyReplicas?: number };
};

export type HelmReleaseObject = ConditionedObject & {
	status?: { conditions?: Condition[]; inventory?: { entries?: { id?: string }[] } };
};

/** Waiting reasons that mean a container will not start without someone changing something. */
export const FAILING_WAIT_REASONS = [
	'CrashLoopBackOff',
	'ImagePullBackOff',
	'ErrImagePull',
	'CreateContainerConfigError',
	'InvalidImageName'
] as const;

const FAILING = new Set<string>(FAILING_WAIT_REASONS);

/** How long an OOM kill keeps a pod failing after the container restarts. */
export const OOM_WINDOW_MS = 60 * 60 * 1000;

/**
 * A container that crashed within this long, after restarting before, is still crash-looping
 * even while it runs between back-offs: the kubelet only resets the back-off after a container
 * has run for 10 minutes.
 */
export const CRASH_LOOP_WINDOW_MS = 10 * 60 * 1000;

function finishedWithin(container: ContainerStatus, now: number, windowMs: number): boolean {
	const finishedAt = container.lastState?.terminated?.finishedAt;
	if (!finishedAt) return false;
	const finished = Date.parse(finishedAt);
	return Number.isFinite(finished) && now - finished <= windowMs;
}

function isCrashLooping(container: ContainerStatus, now: number): boolean {
	return (container.restartCount ?? 0) >= 2 && finishedWithin(container, now, CRASH_LOOP_WINDOW_MS);
}

/**
 * Why a pod is failing, or `null` when it is not. In order: an init container's failure
 * (written `Init:<reason>`, as the Pod list shows it), a container's, an OOM kill in the last
 * hour, then a Failed phase. A container's failure is its waiting reason, or `CrashLoopBackOff`
 * while it runs between two back-offs.
 */
export function podFailure(pod: PodObject, now: number): string | null {
	const status = pod.status ?? {};
	for (const [prefix, containers] of [
		['Init:', status.initContainerStatuses ?? []],
		['', status.containerStatuses ?? []]
	] as const) {
		for (const container of containers) {
			const reason = container.state?.waiting?.reason;
			if (reason && FAILING.has(reason)) return `${prefix}${reason}`;
		}
		for (const container of containers) {
			if (isCrashLooping(container, now)) return `${prefix}CrashLoopBackOff`;
		}
	}
	for (const container of [
		...(status.initContainerStatuses ?? []),
		...(status.containerStatuses ?? [])
	]) {
		if (container.lastState?.terminated?.reason !== 'OOMKilled') continue;
		if (finishedWithin(container, now, OOM_WINDOW_MS)) return 'OOMKilled';
	}
	if (status.phase === 'Failed') return 'Error';
	return null;
}

export type WorkloadKind = 'model' | 'release' | 'other';
export type WorkloadState = 'failing' | 'starting' | 'ready';

export type Workload = {
	kind: WorkloadKind;
	name: string;
	/** For `other`: which kind the name links to. */
	resource?: 'deployments' | 'statefulsets';
	state: WorkloadState;
	/** The failing reason, `Starting`, or empty when ready. */
	reason: string;
};

function conditionOf(object: ConditionedObject, type: string): Condition | undefined {
	return object.status?.conditions?.find((condition) => condition?.type === type);
}

function isReadyCondition(object: ConditionedObject): boolean {
	return conditionOf(object, 'Ready')?.status === 'True';
}

function replicasReady(object: ReplicatedObject): boolean {
	const desired = object.spec?.replicas ?? 1;
	return (object.status?.readyReplicas ?? 0) >= desired;
}

/**
 * A HelmRelease that Flux has given up on (`Stalled`), or whose last install or upgrade
 * failed, will not become ready by waiting; its reason is the Ready condition's.
 */
function releaseFailure(release: HelmReleaseObject): string | null {
	const ready = conditionOf(release, 'Ready');
	if (ready?.status === 'True') return null;
	if (conditionOf(release, 'Stalled')?.status === 'True') return ready?.reason || 'Stalled';
	if (ready?.reason && /Failed$/.test(ready.reason)) return ready.reason;
	return null;
}

function decide(ready: boolean, pods: PodObject[], now: number, ownFailure: string | null) {
	const failure = pods.map((pod) => podFailure(pod, now)).find((reason) => reason) ?? ownFailure;
	if (failure) return { state: 'failing' as const, reason: failure };
	if (!ready) return { state: 'starting' as const, reason: 'Starting' };
	return { state: 'ready' as const, reason: '' };
}

const MODEL_PART_OF = 'app.kubernetes.io/part-of';
const MODEL_NAME = 'app.kubernetes.io/name';
const FLUX_RELEASE_NAME = 'helm.toolkit.fluxcd.io/name';

function isModelObject(metadata: Metadata | undefined): boolean {
	return (
		metadata?.labels?.[MODEL_PART_OF] === 'llminferenceservice' ||
		(metadata?.ownerReferences ?? []).some((owner) => owner?.kind === 'LLMInferenceService')
	);
}

/** The Deployment or StatefulSet that owns a pod, as `deployments/<name>`. */
export function podOwnerKey(pod: PodObject): string | null {
	for (const owner of pod.metadata?.ownerReferences ?? []) {
		if (!owner?.name) continue;
		if (owner.kind === 'StatefulSet') return `statefulsets/${owner.name}`;
		if (owner.kind === 'ReplicaSet') {
			// A Deployment names its ReplicaSets `<deployment>-<pod-template-hash>`.
			const hash = pod.metadata?.labels?.['pod-template-hash'];
			const name =
				hash && owner.name.endsWith(`-${hash}`)
					? owner.name.slice(0, -hash.length - 1)
					: owner.name;
			return `deployments/${name}`;
		}
	}
	return null;
}

/** `<namespace>_<name>_apps_<Kind>` inventory ids, as `deployments/<name>`. */
function inventoryKeys(release: HelmReleaseObject): string[] {
	return (release.status?.inventory?.entries ?? []).flatMap((entry) => {
		const [, name, group, kind] = (entry?.id ?? '').split('_');
		if (!name || group !== 'apps') return [];
		if (kind === 'Deployment') return [`deployments/${name}`];
		if (kind === 'StatefulSet') return [`statefulsets/${name}`];
		return [];
	});
}

export type WorkspaceObjects = {
	models: ConditionedObject[];
	releases: HelmReleaseObject[];
	deployments: ReplicatedObject[];
	statefulSets: ReplicatedObject[];
	pods: PodObject[];
};

/** Every workload in the namespace with its state. */
export function classifyWorkloads(objects: WorkspaceObjects, now: number): Workload[] {
	const podsByOwner = new Map<string, PodObject[]>();
	for (const pod of objects.pods) {
		const key = podOwnerKey(pod);
		if (key) podsByOwner.set(key, [...(podsByOwner.get(key) ?? []), pod]);
	}

	const workloads: Workload[] = [];

	for (const model of objects.models) {
		const name = model.metadata?.name;
		if (!name) continue;
		const pods = objects.pods.filter(
			(pod) =>
				pod.metadata?.labels?.[MODEL_PART_OF] === 'llminferenceservice' &&
				pod.metadata?.labels?.[MODEL_NAME] === name
		);
		workloads.push({ kind: 'model', name, ...decide(isReadyCondition(model), pods, now, null) });
	}

	const releasedKeys = new Set<string>();
	for (const release of objects.releases) {
		const name = release.metadata?.name;
		if (!name) continue;
		const keys = inventoryKeys(release);
		keys.forEach((key) => releasedKeys.add(key));
		const pods = keys.flatMap((key) => podsByOwner.get(key) ?? []);
		workloads.push({
			kind: 'release',
			name,
			...decide(isReadyCondition(release), pods, now, releaseFailure(release))
		});
	}

	const others: [ReplicatedObject, 'deployments' | 'statefulsets'][] = [
		...objects.deployments.map((d) => [d, 'deployments'] as [ReplicatedObject, 'deployments']),
		...objects.statefulSets.map((s) => [s, 'statefulsets'] as [ReplicatedObject, 'statefulsets'])
	];
	for (const [object, resource] of others) {
		const name = object.metadata?.name;
		if (!name) continue;
		const key = `${resource}/${name}`;
		// A model's or a release's workload is counted with it, not again here. A release's is
		// known from its inventory, or from the label Flux puts on what it renders.
		if (isModelObject(object.metadata)) continue;
		if (releasedKeys.has(key) || object.metadata?.labels?.[FLUX_RELEASE_NAME]) continue;
		workloads.push({
			kind: 'other',
			name,
			resource,
			...decide(replicasReady(object), podsByOwner.get(key) ?? [], now, null)
		});
	}

	return workloads;
}

const STATE_ORDER: Record<WorkloadState, number> = { failing: 0, starting: 1, ready: 2 };

/** The workloads that are not ready, failing first, then by name. */
export function notReady(workloads: Workload[]): Workload[] {
	return workloads
		.filter((workload) => workload.state !== 'ready')
		.sort(
			(a, b) =>
				STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
				a.name.localeCompare(b.name) ||
				a.kind.localeCompare(b.kind)
		);
}

export type KindSummary = { ready: number; total: number; tone: 'bad' | 'warn' | 'ok' };

/** Ready count and dot colour for one kind of workload: failing beats starting beats ready. */
export function summarize(workloads: Workload[], kind: WorkloadKind): KindSummary {
	const ofKind = workloads.filter((workload) => workload.kind === kind);
	const ready = ofKind.filter((workload) => workload.state === 'ready').length;
	const tone = ofKind.some((workload) => workload.state === 'failing')
		? 'bad'
		: ofKind.some((workload) => workload.state === 'starting')
			? 'warn'
			: 'ok';
	return { ready, total: ofKind.length, tone };
}

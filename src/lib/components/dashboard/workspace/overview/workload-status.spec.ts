import { describe, expect, it } from 'vitest';

import {
	classifyWorkloads,
	notReady,
	podFailure,
	type PodObject,
	podOwnerKey,
	summarize,
	type Workload
} from './workload-status';

const NOW = Date.parse('2026-11-26T12:00:00Z');

function pod(overrides: {
	name?: string;
	phase?: string;
	labels?: Record<string, string>;
	owner?: { kind: string; name: string };
	init?: object[];
	containers?: object[];
}): PodObject {
	return {
		metadata: {
			name: overrides.name ?? 'p',
			labels: overrides.labels,
			ownerReferences: overrides.owner ? [overrides.owner] : []
		},
		status: {
			phase: overrides.phase ?? 'Running',
			initContainerStatuses: overrides.init as never,
			containerStatuses: overrides.containers as never
		}
	};
}

const waiting = (reason: string) => ({ state: { waiting: { reason } } });
const oomAt = (finishedAt: string) => ({
	state: { running: {} },
	lastState: { terminated: { reason: 'OOMKilled', finishedAt } }
});

describe('podFailure', () => {
	it('is null for a running pod', () => {
		expect(podFailure(pod({ containers: [{ state: { running: {} } }] }), NOW)).toBeNull();
	});

	it.each([
		'CrashLoopBackOff',
		'ImagePullBackOff',
		'ErrImagePull',
		'CreateContainerConfigError',
		'InvalidImageName'
	])('reports a container waiting on %s', (reason) => {
		expect(podFailure(pod({ containers: [waiting(reason)] }), NOW)).toBe(reason);
	});

	it('ignores waiting reasons that pass on their own', () => {
		expect(podFailure(pod({ containers: [waiting('ContainerCreating')] }), NOW)).toBeNull();
		expect(
			podFailure(pod({ phase: 'Pending', containers: [waiting('PodInitializing')] }), NOW)
		).toBeNull();
	});

	it('counts init containers and says so, before the main containers', () => {
		const muse = pod({
			phase: 'Pending',
			init: [waiting('CrashLoopBackOff')],
			containers: [waiting('PodInitializing')]
		});
		expect(podFailure(muse, NOW)).toBe('Init:CrashLoopBackOff');
	});

	it('reports an OOM kill in the last hour, init containers included, and not an older one', () => {
		expect(podFailure(pod({ containers: [oomAt('2026-11-26T11:30:00Z')] }), NOW)).toBe('OOMKilled');
		expect(podFailure(pod({ init: [oomAt('2026-11-26T11:01:00Z')] }), NOW)).toBe('OOMKilled');
		expect(podFailure(pod({ containers: [oomAt('2026-11-26T10:30:00Z')] }), NOW)).toBeNull();
	});

	it('keeps a container that runs between back-offs crash-looping for 10 minutes', () => {
		const between = (restartCount: number, finishedAt: string) => ({
			restartCount,
			state: { running: {} },
			lastState: { terminated: { reason: 'Error', finishedAt } }
		});
		expect(podFailure(pod({ containers: [between(360, '2026-11-26T11:55:00Z')] }), NOW)).toBe(
			'CrashLoopBackOff'
		);
		expect(podFailure(pod({ init: [between(374, '2026-11-26T11:58:00Z')] }), NOW)).toBe(
			'Init:CrashLoopBackOff'
		);
		// Ran 10 minutes since: the kubelet has reset the back-off.
		expect(podFailure(pod({ containers: [between(360, '2026-11-26T11:49:00Z')] }), NOW)).toBeNull();
		// One crash is not a loop.
		expect(podFailure(pod({ containers: [between(1, '2026-11-26T11:59:00Z')] }), NOW)).toBeNull();
	});

	it('names a crash loop rather than the OOM kill that caused it', () => {
		const looping = { ...oomAt('2026-11-26T11:59:00Z'), restartCount: 374 };
		expect(podFailure(pod({ phase: 'Pending', init: [looping] }), NOW)).toBe(
			'Init:CrashLoopBackOff'
		);
	});

	it('reports a Failed pod as Error', () => {
		expect(podFailure(pod({ phase: 'Failed' }), NOW)).toBe('Error');
	});
});

describe('podOwnerKey', () => {
	it('strips the pod-template-hash to find the Deployment', () => {
		const p = pod({
			labels: { 'pod-template-hash': '594b848597' },
			owner: { kind: 'ReplicaSet', name: 'kjhk-kserve-594b848597' }
		});
		expect(podOwnerKey(p)).toBe('deployments/kjhk-kserve');
	});

	it('names the StatefulSet directly', () => {
		expect(podOwnerKey(pod({ owner: { kind: 'StatefulSet', name: 'redis-master' } }))).toBe(
			'statefulsets/redis-master'
		);
	});

	it('has no workload for a Job pod', () => {
		expect(podOwnerKey(pod({ owner: { kind: 'Job', name: 'download' } }))).toBeNull();
	});
});

describe('classifyWorkloads', () => {
	const model = (name: string, ready: boolean) => ({
		metadata: { name },
		status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] }
	});
	const modelPod = (model: string, extra: Parameters<typeof pod>[0] = {}) =>
		pod({
			...extra,
			labels: {
				'app.kubernetes.io/part-of': 'llminferenceservice',
				'app.kubernetes.io/name': model
			}
		});
	const deployment = (
		name: string,
		ready: number,
		labels?: Record<string, string>,
		owner?: string
	) => ({
		metadata: {
			name,
			labels,
			ownerReferences: owner ? [{ kind: 'LLMInferenceService', name: owner }] : []
		},
		spec: { replicas: 1 },
		status: { readyReplicas: ready }
	});

	it('classifies db286l: one ready model, one crash-looping, one failing in an init container', () => {
		const workloads = classifyWorkloads(
			{
				models: [model('qwen', true), model('kjhk', false), model('muse', false)],
				releases: [],
				deployments: [
					deployment(
						'qwen-kserve',
						1,
						{ 'app.kubernetes.io/part-of': 'llminferenceservice' },
						'qwen'
					),
					deployment('kjhk-kserve', 0, undefined, 'kjhk')
				],
				statefulSets: [],
				pods: [
					modelPod('qwen', { containers: [{ state: { running: {} } }] }),
					modelPod('kjhk', { containers: [waiting('CrashLoopBackOff')] }),
					modelPod('muse', { phase: 'Pending', init: [waiting('CrashLoopBackOff')] })
				]
			},
			NOW
		);
		expect(workloads).toEqual([
			{ kind: 'model', name: 'qwen', state: 'ready', reason: '' },
			{ kind: 'model', name: 'kjhk', state: 'failing', reason: 'CrashLoopBackOff' },
			{ kind: 'model', name: 'muse', state: 'failing', reason: 'Init:CrashLoopBackOff' }
		]);
	});

	it('calls a workload that is not ready but has no failing pod Starting', () => {
		const [workload] = classifyWorkloads(
			{ models: [model('m', false)], releases: [], deployments: [], statefulSets: [], pods: [] },
			NOW
		);
		expect(workload).toMatchObject({ state: 'starting', reason: 'Starting' });
	});

	it('ties a release to the pods of the workloads in its inventory, and keeps those out of Other', () => {
		const workloads = classifyWorkloads(
			{
				models: [],
				releases: [
					{
						metadata: { name: 'redis' },
						status: {
							conditions: [{ type: 'Ready', status: 'True' }],
							inventory: { entries: [{ id: 'db286l_redis-master_apps_StatefulSet' }] }
						}
					}
				],
				deployments: [deployment('api-proxy', 1)],
				statefulSets: [
					{
						metadata: { name: 'redis-master' },
						spec: { replicas: 1 },
						status: { readyReplicas: 0 }
					}
				],
				pods: [
					pod({
						owner: { kind: 'StatefulSet', name: 'redis-master' },
						containers: [waiting('CrashLoopBackOff')]
					})
				]
			},
			NOW
		);
		expect(workloads).toEqual([
			{ kind: 'release', name: 'redis', state: 'failing', reason: 'CrashLoopBackOff' },
			{ kind: 'other', name: 'api-proxy', resource: 'deployments', state: 'ready', reason: '' }
		]);
	});

	it('leaves out of Other a workload Flux labelled, even when it is not in an inventory', () => {
		const workloads = classifyWorkloads(
			{
				models: [],
				releases: [],
				deployments: [deployment('grafana', 1, { 'helm.toolkit.fluxcd.io/name': 'grafana' })],
				statefulSets: [],
				pods: []
			},
			NOW
		);
		expect(workloads).toEqual([]);
	});

	it('fails a release Flux has stalled on, with the Ready reason', () => {
		const [release] = classifyWorkloads(
			{
				models: [],
				releases: [
					{
						metadata: { name: 'minio' },
						status: {
							conditions: [
								{ type: 'Ready', status: 'False', reason: 'InstallFailed' },
								{ type: 'Stalled', status: 'True' }
							]
						}
					}
				],
				deployments: [],
				statefulSets: [],
				pods: []
			},
			NOW
		);
		expect(release).toMatchObject({ state: 'failing', reason: 'InstallFailed' });
	});

	it('ties an Other deployment to its pods through the ReplicaSet', () => {
		const [workload] = classifyWorkloads(
			{
				models: [],
				releases: [],
				deployments: [deployment('etl-worker', 0)],
				statefulSets: [],
				pods: [
					pod({
						phase: 'Failed',
						labels: { 'pod-template-hash': 'abc12' },
						owner: { kind: 'ReplicaSet', name: 'etl-worker-abc12' }
					})
				]
			},
			NOW
		);
		expect(workload).toMatchObject({ kind: 'other', state: 'failing', reason: 'Error' });
	});
});

describe('notReady and summarize', () => {
	const w = (name: string, kind: Workload['kind'], state: Workload['state']): Workload => ({
		name,
		kind,
		state,
		reason: state === 'failing' ? 'CrashLoopBackOff' : state === 'starting' ? 'Starting' : ''
	});
	const workloads = [
		w('muse', 'model', 'starting'),
		w('qwen', 'model', 'ready'),
		w('phi', 'model', 'failing'),
		w('bge', 'model', 'failing'),
		w('redis', 'release', 'starting')
	];

	it('lists failing first, then starting, each by name, and leaves out the ready', () => {
		expect(notReady(workloads).map((x) => x.name)).toEqual(['bge', 'phi', 'muse', 'redis']);
	});

	it('counts ready per kind and colours the dot by the worst state', () => {
		expect(summarize(workloads, 'model')).toEqual({ ready: 1, total: 4, tone: 'bad' });
		expect(summarize(workloads, 'release')).toEqual({ ready: 0, total: 1, tone: 'warn' });
		expect(summarize([w('a', 'other', 'ready')], 'other')).toEqual({
			ready: 1,
			total: 1,
			tone: 'ok'
		});
		expect(summarize([], 'other')).toEqual({ ready: 0, total: 0, tone: 'ok' });
	});
});

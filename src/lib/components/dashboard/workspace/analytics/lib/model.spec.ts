import { describe, expect, it } from 'vitest';

import type { WorkloadMembers } from '../../overview/workload-status';
import {
	assignPods,
	barScale,
	barShares,
	chartRows,
	colourSlots,
	entriesOf,
	type Entry,
	entryLines,
	historyStep,
	historyTotals,
	mergeLines,
	OTHER,
	podGpu,
	type PodNow,
	podStatus,
	quotaOf,
	rankEntries,
	requestedUnused,
	restartBars,
	restartBucket,
	restartSources,
	sortPods,
	storageSummary,
	type Totals,
	totalsOf,
	volumesOf,
	WORKSPACE_ID
} from './model';

const GIB = 1024 ** 3;

function workload(name: string, overrides: Partial<WorkloadMembers> = {}): WorkloadMembers {
	return { kind: 'model', name, state: 'ready', reason: '', pods: [], owners: [], ...overrides };
}

function totals(overrides: Partial<Totals> = {}): Totals {
	return { cpu: {}, memory: {}, restarts: 0, podsReady: 0, podsTotal: 0, ...overrides };
}

function pod(name: string, overrides: Partial<PodNow> = {}): PodNow {
	return {
		pod: name,
		node: 'n1',
		phase: 'Running',
		ready: true,
		restarts: 0,
		cpu: {},
		memory: {},
		...overrides
	};
}

const row = (entry: Entry, t: Partial<Totals> = {}) => ({ entry, totals: totals(t) });

describe('entriesOf', () => {
	it('puts the workspace first, in the worst state of its workloads', () => {
		const entries = entriesOf('db286l', [
			workload('qwen'),
			workload('kjhk', { state: 'failing', reason: 'CrashLoopBackOff' }),
			workload('muse', { state: 'starting', reason: 'Starting' })
		]);
		expect(entries.map((e) => e.id)).toEqual([WORKSPACE_ID, 'qwen', 'kjhk', 'muse']);
		expect(entries[0]).toMatchObject({ kind: 'workspace', name: 'db286l', state: 'failing' });
	});

	it('is ready with no workloads', () => {
		expect(entriesOf('ns', [])[0].state).toBe('ready');
	});

	it('keeps ids unique when two kinds share a name', () => {
		const entries = entriesOf('ns', [workload('redis'), workload('redis', { kind: 'release' })]);
		expect(entries.map((e) => e.id)).toEqual([WORKSPACE_ID, 'redis', 'release/redis']);
	});
});

describe('assignPods', () => {
	const entries = entriesOf('db286l', [
		workload('qwen', {
			pods: ['qwen-kserve-8c9dbb8cb-kpf2t'],
			owners: ['deployments/qwen-kserve', 'deployments/qwen-kserve-router-scheduler']
		}),
		workload('redis', { kind: 'release', owners: ['statefulsets/redis-master'] }),
		workload('redhatai-muse-glimmer-30b-nvfp4', {
			owners: ['deployments/redhatai-muse-glimmer-30b-nvfp4-kserve-router-scheduler']
		}),
		workload('api', { kind: 'other', owners: ['deployments/api'] })
	]);

	it('takes the pods the Resource API listed under a workload', () => {
		expect(
			assignPods(['qwen-kserve-8c9dbb8cb-kpf2t'], entries).get('qwen-kserve-8c9dbb8cb-kpf2t')
		).toBe('qwen');
	});

	it('gives a replaced pod to the workload whose Deployment generated its name', () => {
		const owner = assignPods(
			['qwen-kserve-57dbf98-f2t7v', 'qwen-kserve-router-scheduler-649f4dd8b6-7tkws'],
			entries
		);
		expect(owner.get('qwen-kserve-57dbf98-f2t7v')).toBe('qwen');
		expect(owner.get('qwen-kserve-router-scheduler-649f4dd8b6-7tkws')).toBe('qwen');
	});

	it('matches a StatefulSet pod by its ordinal only', () => {
		const owner = assignPods(['redis-master-0', 'redis-master-backup-x7k2p'], entries);
		expect(owner.get('redis-master-0')).toBe('redis');
		expect(owner.has('redis-master-backup-x7k2p')).toBe(false);
	});

	it('matches a name Kubernetes cut to 63 characters', () => {
		const name = 'redhatai-muse-glimmer-30b-nvfp4-kserve-router-scheduler-7flcbpz';
		expect(name).toHaveLength(63);
		expect(assignPods([name], entries).get(name)).toBe('redhatai-muse-glimmer-30b-nvfp4');
	});

	it('leaves a Job pod, or one that only shares a prefix, with no workload', () => {
		const owner = assignPods(['download-muse-glimmer-30b-z7dkc', 'api-migrate-x7k2p'], entries);
		expect(owner.size).toBe(0);
	});
});

describe('totalsOf', () => {
	it('adds up live pods, and counts restarts of every pod', () => {
		const t = totalsOf([
			pod('a', {
				restarts: 3.2,
				cpu: { used: 0.5, requested: 2 },
				memory: { used: GIB, requested: 2 * GIB, limit: 4 * GIB },
				gpu: { used: 10, allocated: 40, util: 30, cards: ['g1'] }
			}),
			pod('b', {
				ready: false,
				phase: 'Pending',
				cpu: { requested: 1, limit: 2 },
				memory: {},
				gpu: { allocated: 20, util: 10, cards: ['g1', 'g2'] }
			}),
			pod('job', { phase: 'Succeeded', restarts: 1, cpu: { requested: 8 }, memory: {} })
		]);
		expect(t.cpu).toEqual({ used: 0.5, requested: 3, limit: 2 });
		expect(t.memory).toEqual({ used: GIB, requested: 2 * GIB, limit: 4 * GIB });
		expect(t.gpu).toEqual({ allocated: 60, used: 10, util: 20, cards: 2 });
		expect(t.restarts).toBe(4);
		expect([t.podsReady, t.podsTotal]).toEqual([1, 2]);
	});

	it('has no GPU when no pod holds an allocation', () => {
		expect(totalsOf([pod('a')]).gpu).toBeUndefined();
	});
});

describe('quotaOf', () => {
	it('reads request quotas, and GPU memory in MiB', () => {
		expect(
			quotaOf(
				new Map([
					['requests.cpu', 16],
					['requests.memory', 256 * GIB],
					['limits.cpu', 32],
					['limits.nvidia.com/gpumem', 97_887]
				])
			)
		).toEqual({ cpu: 16, memory: 256 * GIB, gpuMemory: 97_887 * 1024 ** 2 });
	});

	it('is empty without a ResourceQuota', () => {
		expect(quotaOf(new Map())).toEqual({ cpu: undefined, memory: undefined, gpuMemory: undefined });
	});
});

describe('barScale and barShares', () => {
	const workspace = totals({
		cpu: { used: 1, requested: 9, limit: 19 },
		memory: { used: 8 * GIB, requested: 127 * GIB },
		gpu: { used: 86, allocated: 239, cards: 3 },
		restarts: 145
	});
	const one = totals({ cpu: { used: 0.45, requested: 2.25 }, restarts: 145 });

	it('scales to the quota when there is one', () => {
		const scale = barScale('cpu', workspace, [workspace, one], { cpu: 18 });
		expect(scale).toBe(18);
		expect(barShares('cpu', workspace, scale)).toEqual({ solid: 100 / 18, soft: 50 });
		expect(barShares('cpu', one, scale)).toEqual({ solid: 2.5, soft: 12.5 });
	});

	it('scales to what the workspace requests when there is no quota', () => {
		const scale = barScale('cpu', workspace, [workspace, one], {});
		expect(scale).toBe(9);
		expect(barShares('cpu', workspace, scale)?.soft).toBe(100);
		expect(barShares('cpu', one, scale)).toEqual({ solid: 5, soft: 25 });
	});

	it('scales GPU bars to the quota, or to what is allocated', () => {
		expect(barScale('gpu', workspace, [], { gpuMemory: 478 })).toBe(478);
		const scale = barScale('gpu', workspace, [], {});
		expect(scale).toBe(239);
		expect(barShares('gpu', workspace, scale)).toEqual({ solid: (100 * 86) / 239, soft: 100 });
	});

	it('gives a row with no GPU no bar', () => {
		expect(barShares('gpu', one, 239)).toBeUndefined();
	});

	it('scales restarts to the largest row', () => {
		const scale = barScale('restarts', workspace, [workspace, one, totals({ restarts: 29 })], {});
		expect(scale).toBe(145);
		expect(barShares('restarts', totals({ restarts: 29 }), scale)).toEqual({ solid: 20 });
	});

	it('never passes the track, and is empty when there is nothing to scale to', () => {
		expect(barShares('cpu', totals({ cpu: { used: 5, requested: 3 } }), 2)).toEqual({
			solid: 100,
			soft: 100
		});
		expect(barShares('cpu', one, 0)).toEqual({ solid: 0, soft: 0 });
		expect(barShares('memory', totals(), 10)).toEqual({ solid: 0, soft: 0 });
	});
});

describe('rankEntries', () => {
	const [ws, a, b, c, d] = entriesOf('ns', [
		workload('a'),
		workload('b', { state: 'failing', reason: 'CrashLoopBackOff' }),
		workload('c', { state: 'starting', reason: 'Starting' }),
		workload('d')
	]);
	const ids = (rows: { entry: Entry }[]) => rows.map((r) => r.entry.id);

	it('keeps the workspace first and sorts CPU by requested, largest first', () => {
		const rows = [
			row(a, { cpu: { used: 9, requested: 1 } }),
			row(b, { cpu: { used: 0, requested: 5 } }),
			row(ws, { cpu: { requested: 0.1 } }),
			row(c, { cpu: { requested: 2 } })
		];
		expect(ids(rankEntries(rows, 'cpu'))).toEqual([WORKSPACE_ID, 'b', 'c', 'a']);
	});

	it('sorts memory by requested', () => {
		const rows = [row(a, { memory: { requested: 1 } }), row(b, { memory: { requested: 3 } })];
		expect(ids(rankEntries(rows, 'memory'))).toEqual(['b', 'a']);
	});

	it('sorts GPU by allocated and puts rows without a GPU last', () => {
		const rows = [
			row(a),
			row(b, { gpu: { allocated: 48, cards: 1 } }),
			row(c, { gpu: { allocated: 96, used: 1, cards: 1 } }),
			row(d, { gpu: { allocated: 0, cards: 0 } })
		];
		expect(ids(rankEntries(rows, 'gpu'))).toEqual(['c', 'b', 'd', 'a']);
	});

	it('sorts restarts, largest first', () => {
		const rows = [row(a, { restarts: 2 }), row(b, { restarts: 145 }), row(c)];
		expect(ids(rankEntries(rows, 'restarts'))).toEqual(['b', 'a', 'c']);
	});

	it('breaks ties failing, starting, ready, then by name', () => {
		const rows = [row(d), row(a), row(c), row(b)];
		expect(ids(rankEntries(rows, 'restarts'))).toEqual(['b', 'c', 'a', 'd']);
	});

	it('puts a row with no request after one that requests nothing', () => {
		const rows = [row(a), row(d, { cpu: { requested: 0 } })];
		expect(ids(rankEntries(rows, 'cpu'))).toEqual(['d', 'a']);
	});

	it('does not change the list it was given', () => {
		const rows = [row(a), row(b, { restarts: 1 })];
		rankEntries(rows, 'restarts');
		expect(ids(rows)).toEqual(['a', 'b']);
	});
});

describe('requestedUnused', () => {
	it('is the share of the request the average usage left', () => {
		expect(requestedUnused(0.9, 9)).toBeCloseTo(90);
		expect(requestedUnused(7.6 * GIB, 127 * GIB)).toBeCloseTo(94.0157, 3);
	});

	it('is 0 when usage is at or above the request, never negative', () => {
		expect(requestedUnused(2, 2)).toBe(0);
		expect(requestedUnused(3, 2)).toBe(0);
	});

	it('is 100 when nothing is used', () => {
		expect(requestedUnused(0, 4)).toBe(100);
	});

	it('is undefined without a request or without usage', () => {
		expect(requestedUnused(1, 0)).toBeUndefined();
		expect(requestedUnused(1, undefined)).toBeUndefined();
		expect(requestedUnused(undefined, 4)).toBeUndefined();
		expect(requestedUnused(NaN, 4)).toBeUndefined();
	});
});

describe('podStatus and sortPods', () => {
	it('names what a pod is doing', () => {
		expect(podStatus(pod('a'))).toEqual({ text: 'Running', tone: 'ok' });
		expect(podStatus(pod('a', { ready: false }))).toEqual({ text: 'Not ready', tone: 'warn' });
		expect(podStatus(pod('a', { waiting: 'CrashLoopBackOff' }))).toEqual({
			text: 'CrashLoopBackOff',
			tone: 'bad'
		});
		expect(podStatus(pod('a', { phase: 'Pending', waiting: 'Init:CrashLoopBackOff' }))).toEqual({
			text: 'Init:CrashLoopBackOff',
			tone: 'bad'
		});
		expect(podStatus(pod('a', { phase: 'Pending', waiting: 'ContainerCreating' })).tone).toBe(
			'warn'
		);
		expect(podStatus(pod('a', { phase: 'Failed' }))).toEqual({ text: 'Failed', tone: 'bad' });
		expect(podStatus(pod('a', { phase: 'Pending', ready: false }))).toEqual({
			text: 'Pending',
			tone: 'warn'
		});
	});

	it('lists most restarts first, then pods in trouble, then by name', () => {
		const sorted = sortPods([
			pod('d'),
			pod('c', { ready: false }),
			pod('b', { restarts: 2.4 }),
			pod('a', { restarts: 145 }),
			pod('e', { phase: 'Pending', waiting: 'ImagePullBackOff' })
		]);
		expect(sorted.map((p) => p.pod)).toEqual(['a', 'b', 'c', 'e', 'd']);
	});
});

describe('restartSources', () => {
	it('names the workloads that restarted, most restarts first, not the workspace', () => {
		const [ws, a, b, c] = entriesOf('ns', [workload('a'), workload('b'), workload('c')]);
		expect(
			restartSources([
				row(ws, { restarts: 150 }),
				row(a, { restarts: 5 }),
				row(b, { restarts: 145 }),
				row(c)
			])
		).toEqual(['b', 'a']);
	});
});

describe('storage', () => {
	const volumes = [
		{ name: 'hf-cache', used: 880 * GIB, capacity: 900 * GIB, growthPerDay: 2 * GIB, pods: ['p1'] },
		{ name: 'data', used: 10 * GIB, capacity: 60 * GIB, growthPerDay: 0, pods: ['p2'] },
		{ name: 'slow', used: 1 * GIB, capacity: 100 * GIB, growthPerDay: 1 * GIB, pods: [] },
		{ name: 'new', used: 1 * GIB, capacity: 10 * GIB, growthPerDay: null, pods: ['p1', 'p3'] }
	];

	it('adds up written and capacity, and names the volume that fills first within 30 days', () => {
		expect(storageSummary(volumes)).toEqual({
			used: 892 * GIB,
			capacity: 1070 * GIB,
			count: 4,
			soonest: { name: 'hf-cache', days: 10 }
		});
	});

	it('has no forecast when nothing fills within 30 days', () => {
		expect(storageSummary(volumes.slice(1)).soonest).toBeUndefined();
		expect(storageSummary([])).toEqual({ used: 0, capacity: 0, count: 0, soonest: undefined });
	});

	it('counts for a workload only the volumes its pods mount', () => {
		const owner = new Map([
			['p1', 'qwen'],
			['p2', 'pg']
		]);
		expect(volumesOf('qwen', volumes, owner).map((v) => v.name)).toEqual(['hf-cache', 'new']);
		expect(volumesOf('pg', volumes, owner).map((v) => v.name)).toEqual(['data']);
		expect(volumesOf(WORKSPACE_ID, volumes, owner)).toHaveLength(4);
	});
});

describe('lines', () => {
	const series = [
		{
			labels: { pod: 'a-1' },
			points: [
				{ t: 1000, v: 1 },
				{ t: 2000, v: 3 }
			]
		},
		{ labels: { pod: 'a-2' }, points: [{ t: 2000, v: 5 }] },
		{ labels: { pod: 'b-1' }, points: [{ t: 1000, v: 10 }] }
	];
	const owner = new Map([
		['a-1', 'a'],
		['a-2', 'a'],
		['b-1', 'b']
	]);

	it('sums, averages or takes the largest of the kept series per timestamp', () => {
		const a = (labels: Record<string, string>) => labels.pod.startsWith('a');
		expect([...mergeLines(series, a)]).toEqual([
			[1000, 1],
			[2000, 8]
		]);
		expect([...mergeLines(series, a, 'avg')]).toEqual([
			[1000, 1],
			[2000, 4]
		]);
		expect([...mergeLines(series, () => true, 'max')]).toEqual([
			[1000, 10],
			[2000, 5]
		]);
	});

	it('builds a workload row from its pods and the workspace row from all of them', () => {
		const a = entryLines('a', { cpuUse: series, restarts: series }, owner);
		expect([...(a.cpuUse ?? [])]).toEqual([
			[1000, 1],
			[2000, 8]
		]);
		expect([...(a.restarts ?? [])]).toEqual([
			[1000, 1],
			[2000, 8]
		]);
		const ws = entryLines(WORKSPACE_ID, { cpuUse: series }, owner);
		expect([...(ws.cpuUse ?? [])]).toEqual([
			[1000, 11],
			[2000, 8]
		]);
		expect(entryLines('c', { cpuUse: series }, owner)).toEqual({});
	});

	it('averages CPU and memory for the History ranking, and keeps what has no line', () => {
		const lines = entryLines('a', { cpuUse: series, cpuReq: series }, owner);
		const gpu = { allocated: 96, used: 85, util: 12, cards: 1 };
		const now = totals({ restarts: 7, podsReady: 1, podsTotal: 2, gpu });
		expect(historyTotals(lines, now)).toEqual({
			cpu: { used: 4.5, requested: 4.5, limit: undefined },
			memory: { used: undefined, requested: undefined, limit: undefined },
			gpu,
			restarts: 7,
			podsReady: 1,
			podsTotal: 2
		});
		expect(historyTotals({}, totals()).gpu).toBeUndefined();
	});

	it('lays lines out as chart rows in time order, scaled, with constant levels', () => {
		const rows = chartRows(
			{
				used: new Map([
					[2000, 4],
					[1000, 2]
				]),
				requested: new Map([[1000, 8]]),
				none: undefined
			},
			0.5,
			{ quota: 20, absent: undefined }
		);
		expect(rows).toEqual([
			{ date: new Date(1000), used: 1, requested: 4, quota: 10 },
			{ date: new Date(2000), used: 2, quota: 10 }
		]);
	});
});

describe('steps and buckets', () => {
	it('follows the window: 1 h in minutes, 24 h in five minutes, 7 d in hours', () => {
		expect(historyStep(3600)).toBe(60);
		expect(historyStep(86_400)).toBe(300);
		expect(historyStep(7 * 86_400)).toBe(3600);
	});

	it('draws hourly restart bars for a day, shorter and longer ones at the extremes', () => {
		expect(restartBucket(3600)).toBe(300);
		expect(restartBucket(86_400)).toBe(3600);
		expect(restartBucket(7 * 86_400)).toBe(6 * 3600);
	});

	it('makes one bar per bucket, zero where nothing restarted', () => {
		const hour = 3_600_000;
		const bars = restartBars(
			new Map([
				[2 * hour, 17.6],
				[3 * hour + 40, 2.2]
			]),
			0,
			4 * hour,
			3600
		);
		expect(bars.map((b) => b.restarts)).toEqual([0, 18, 2, 0]);
		expect(bars[1]).toMatchObject({ date: new Date(hour), end: new Date(2 * hour) });
	});
});

describe('colourSlots', () => {
	it('gives the first four names, in alphabetical order, a slot each and the rest one group', () => {
		const slots = colourSlots(['qwen', 'bge', 'muse', 'zeta', 'alpha', 'bge']);
		expect(slots.get('alpha')).toBe(0);
		expect(slots.get('bge')).toBe(1);
		expect(slots.get('muse')).toBe(2);
		expect(slots.get('qwen')).toBe(3);
		expect(slots.get('zeta')).toBe(OTHER);
	});

	it('keeps a name on its slot whatever the order it is given in', () => {
		expect(colourSlots(['b', 'a']).get('a')).toBe(colourSlots(['a', 'b']).get('a'));
	});
});

describe('podGpu', () => {
	const used = new Map([
		['g1', 85],
		['g2', 40]
	]);
	const util = new Map([
		['g1', 30],
		['g2', 90]
	]);

	it('is undefined for a pod with no booking', () => {
		expect(podGpu([], used, new Map(), util)).toBeUndefined();
	});

	it('takes usage and utilisation from the cards the pod has to itself', () => {
		expect(podGpu([{ uuid: 'g1', bytes: 96 }], used, new Map([['g1', 1]]), util)).toEqual({
			allocated: 96,
			used: 85,
			util: 30,
			cards: ['g1']
		});
	});

	it('counts the allocation on a shared card but not its usage', () => {
		const tenants = new Map([
			['g1', 1],
			['g2', 3]
		]);
		expect(
			podGpu(
				[
					{ uuid: 'g1', bytes: 96 },
					{ uuid: 'g2', bytes: 48 }
				],
				used,
				tenants,
				util
			)
		).toEqual({ allocated: 144, used: 85, util: 30, cards: ['g1', 'g2'] });
		expect(podGpu([{ uuid: 'g2', bytes: 48 }], used, tenants, util)).toEqual({
			allocated: 48,
			used: undefined,
			util: undefined,
			cards: ['g2']
		});
	});

	it('has no usage when the card reports none', () => {
		expect(podGpu([{ uuid: 'g9', bytes: 10 }], used, new Map(), util)).toMatchObject({
			allocated: 10,
			used: undefined,
			util: undefined
		});
	});
});

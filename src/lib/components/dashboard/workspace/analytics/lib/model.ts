/**
 * Workspace Analytics, the arithmetic: which pods belong to which workload, what each row of the
 * ranking adds up to, how rows sort and how long their bars are. No fetching and no copy, so
 * every rule here can be tested with plain objects.
 */

import type { Series } from '$lib/components/dashboard/kit/fetch';

import { daysUntilFull, FULL_SOON_DAYS } from '../../overview/pvc-forecast';
import {
	FAILING_WAIT_REASONS,
	type WorkloadKind,
	type WorkloadMembers,
	type WorkloadState
} from '../../overview/workload-status';

export type RankMetric = 'cpu' | 'memory' | 'gpu' | 'restarts';
export const RANK_METRICS: RankMetric[] = ['cpu', 'memory', 'gpu', 'restarts'];

/** The id of the ranking's first row, and the `sel` value for it in the URL. */
export const WORKSPACE_ID = '__ws';

/** A row of the ranking: the whole workspace, or one workload. */
export type Entry = {
	id: string;
	kind: 'workspace' | WorkloadKind;
	name: string;
	resource?: 'deployments' | 'statefulsets';
	state: WorkloadState;
	/** The failing reason, `Starting`, or empty when ready. */
	reason: string;
	pods: string[];
	owners: string[];
};

const STATE_ORDER: Record<WorkloadState, number> = { failing: 0, starting: 1, ready: 2 };

/**
 * The ranking's rows: the workspace first, then every workload. A workload's id is its name, so
 * a link reads `sel=qwen`; when two kinds share a name the later one is `kind/name`.
 */
export function entriesOf(namespace: string, workloads: WorkloadMembers[]): Entry[] {
	const worst = workloads.reduce<WorkloadState>(
		(state, w) => (STATE_ORDER[w.state] < STATE_ORDER[state] ? w.state : state),
		'ready'
	);
	const taken = new Set<string>([WORKSPACE_ID]);
	const rows: Entry[] = [
		{
			id: WORKSPACE_ID,
			kind: 'workspace',
			name: namespace,
			state: worst,
			reason: '',
			pods: [],
			owners: []
		}
	];
	for (const w of workloads) {
		const id = taken.has(w.name) ? `${w.kind}/${w.name}` : w.name;
		taken.add(id);
		rows.push({ ...w, id });
	}
	return rows;
}

/** Kubernetes cuts a generated pod name's base to 58 characters before adding five more. */
const GENERATED_BASE = 58;
const GENERATED_NAME = 63;

/**
 * The letters Kubernetes generates a pod-template hash and a pod's five-character suffix from:
 * no vowels and no 0, 1 or 3, so a generated part never reads as a word. A Job's pod named
 * `api-migrate-x7k2p` is therefore not taken for a pod of the Deployment `api`.
 */
const SAFE = '[bcdfghjklmnpqrstvwxz2456789]';
const GENERATED = new RegExp(`^${SAFE}+-${SAFE}{5}$`);
const GENERATED_CUT = new RegExp(`^${SAFE}*-?${SAFE}{5}$`);

function ownedBy(pod: string, owner: string): boolean {
	const [resource, name] = owner.split('/');
	if (!name) return false;
	const prefix = `${name}-`.slice(0, GENERATED_BASE);
	if (!pod.startsWith(prefix)) return false;
	const rest = pod.slice(prefix.length);
	if (resource === 'statefulsets') return /^\d+$/.test(rest);
	// `<deployment>-<template hash>-<5 chars>`, or that cut short when the name is long.
	if (GENERATED.test(rest)) return true;
	return pod.length === GENERATED_NAME && GENERATED_CUT.test(rest);
}

/**
 * Which workload each pod belongs to. A pod the Resource API listed under a workload is that
 * workload's; a pod that is gone (History still has its series) goes to the workload whose
 * Deployment or StatefulSet its name was generated from. Pods of neither kind, a Job's for
 * example, belong to no workload and count only in the workspace row.
 */
export function assignPods(pods: Iterable<string>, entries: Entry[]): Map<string, string> {
	const exact = new Map<string, string>();
	for (const entry of entries) for (const pod of entry.pods) exact.set(pod, entry.id);
	const out = new Map<string, string>();
	for (const pod of pods) {
		const listed = exact.get(pod);
		if (listed) {
			out.set(pod, listed);
			continue;
		}
		let best: { id: string; length: number } | undefined;
		for (const entry of entries) {
			for (const owner of entry.owners) {
				if (ownedBy(pod, owner) && owner.length > (best?.length ?? 0)) {
					best = { id: entry.id, length: owner.length };
				}
			}
		}
		if (best) out.set(pod, best.id);
	}
	return out;
}

/** Whether a pod counts for this row: every pod for the workspace, its own for a workload. */
export function inEntry(entryId: string, pod: string, owner: Map<string, string>): boolean {
	return entryId === WORKSPACE_ID || owner.get(pod) === entryId;
}

export type Triple = { used?: number; requested?: number; limit?: number };
export type GpuTotals = {
	/** 0–100, averaged over the row's GPU containers. */
	util?: number;
	used?: number;
	allocated: number;
	cards: number;
};
export type Totals = {
	cpu: Triple;
	memory: Triple;
	/** Left out when the row has no GPU allocation. */
	gpu?: GpuTotals;
	restarts: number;
	podsReady: number;
	podsTotal: number;
};

export type PodNow = {
	pod: string;
	node: string;
	phase: string;
	ready: boolean;
	/** A container's waiting reason; an init container's reads `Init:<reason>`. */
	waiting?: string;
	/** Containers and init containers together, over the last 24 hours. */
	restarts: number;
	cpu: Triple;
	memory: Triple;
	gpu?: { used?: number; allocated: number; util?: number; cards: string[] };
	/** Why the last container to stop did, and its exit code. */
	lastReason?: string;
	exitCode?: number;
};

function add(a: number | undefined, b: number | undefined): number | undefined {
	if (a === undefined) return b;
	if (b === undefined) return a;
	return a + b;
}

function addTriple(a: Triple, b: Triple): Triple {
	return {
		used: add(a.used, b.used),
		requested: add(a.requested, b.requested),
		limit: add(a.limit, b.limit)
	};
}

/** Pods that still run or wait to: the set requests, limits and "pods ready" count. */
export function isLive(pod: { phase: string }): boolean {
	return pod.phase === 'Running' || pod.phase === 'Pending' || pod.phase === 'Unknown';
}

/** One row's numbers now: the sum of its live pods. */
export function totalsOf(pods: PodNow[]): Totals {
	let cpu: Triple = {};
	let memory: Triple = {};
	let restarts = 0;
	let podsReady = 0;
	let podsTotal = 0;
	let gpu: GpuTotals | undefined;
	const cards = new Set<string>();
	const utils: number[] = [];
	for (const pod of pods) {
		restarts += Math.round(pod.restarts);
		if (!isLive(pod)) continue;
		podsTotal++;
		if (pod.ready) podsReady++;
		cpu = addTriple(cpu, pod.cpu);
		memory = addTriple(memory, pod.memory);
		if (pod.gpu) {
			gpu = {
				allocated: (gpu?.allocated ?? 0) + pod.gpu.allocated,
				used: add(gpu?.used, pod.gpu.used),
				cards: 0
			};
			pod.gpu.cards.forEach((card) => cards.add(card));
			if (pod.gpu.util !== undefined) utils.push(pod.gpu.util);
		}
	}
	if (gpu) {
		gpu.cards = cards.size;
		if (utils.length > 0) gpu.util = utils.reduce((a, b) => a + b, 0) / utils.length;
	}
	return { cpu, memory, gpu, restarts, podsReady, podsTotal };
}

/** The workspace's ResourceQuota, in cores and bytes; a missing key is no quota for it. */
export type Quota = { cpu?: number; memory?: number; gpuMemory?: number };

const MIB = 1024 ** 2;

/**
 * `kube_resourcequota{type="hard"}` by resource. CPU and memory quotas are the request ones, the
 * numbers the bars compare; GPU memory is `limits.nvidia.com/gpumem`, which counts MiB.
 */
export function quotaOf(hard: Map<string, number>): Quota {
	const positive = (value: number | undefined) =>
		value !== undefined && Number.isFinite(value) && value > 0 ? value : undefined;
	const gpu = positive(
		hard.get('limits.nvidia.com/gpumem') ?? hard.get('requests.nvidia.com/gpumem')
	);
	return {
		cpu: positive(hard.get('requests.cpu')),
		memory: positive(hard.get('requests.memory')),
		gpuMemory: gpu === undefined ? undefined : gpu * MIB
	};
}

export function hasQuota(quota: Quota, metric: RankMetric): boolean {
	if (metric === 'cpu') return quota.cpu !== undefined;
	if (metric === 'memory') return quota.memory !== undefined;
	if (metric === 'gpu') return quota.gpuMemory !== undefined;
	return false;
}

/**
 * What a full bar stands for. With a quota it is the quota; without one it is what the whole
 * workspace requests (for GPU, has allocated). Restarts have no ceiling, so the largest row is
 * the full bar.
 */
export function barScale(
	metric: RankMetric,
	workspace: Totals,
	rows: Totals[],
	quota: Quota
): number {
	if (metric === 'cpu') return quota.cpu ?? workspace.cpu.requested ?? 0;
	if (metric === 'memory') return quota.memory ?? workspace.memory.requested ?? 0;
	if (metric === 'gpu') return quota.gpuMemory ?? workspace.gpu?.allocated ?? 0;
	return Math.max(0, workspace.restarts, ...rows.map((row) => row.restarts));
}

function share(value: number | undefined, scale: number): number {
	if (value === undefined || !(scale > 0) || !Number.isFinite(value)) return 0;
	return Math.min(100, Math.max(0, (100 * value) / scale));
}

/**
 * A row's bars as percentages of the track: `solid` is what is in use, `soft` what is requested
 * or allocated. Undefined for a row with no GPU on the GPU tab, which shows a note instead.
 */
export function barShares(
	metric: RankMetric,
	totals: Totals,
	scale: number
): { solid: number; soft?: number } | undefined {
	if (metric === 'cpu' || metric === 'memory') {
		const t = totals[metric];
		return { solid: share(t.used, scale), soft: share(t.requested, scale) };
	}
	if (metric === 'gpu') {
		if (!totals.gpu) return undefined;
		return { solid: share(totals.gpu.used, scale), soft: share(totals.gpu.allocated, scale) };
	}
	return { solid: share(totals.restarts, scale) };
}

/** The number a tab sorts by; a row without it sorts last. */
export function sortValue(metric: RankMetric, totals: Totals): number {
	if (metric === 'cpu') return totals.cpu.requested ?? -1;
	if (metric === 'memory') return totals.memory.requested ?? -1;
	if (metric === 'gpu') return totals.gpu ? totals.gpu.allocated : -Infinity;
	return totals.restarts;
}

/**
 * The ranking's order: the workspace row first, then the tab's number from large to small. Rows
 * with the same number go failing, starting, ready, then by name.
 */
export function rankEntries<T extends { entry: Entry; totals: Totals }>(
	rows: T[],
	metric: RankMetric
): T[] {
	return [...rows].sort((a, b) => {
		const pinned = Number(b.entry.id === WORKSPACE_ID) - Number(a.entry.id === WORKSPACE_ID);
		if (pinned !== 0) return pinned;
		const av = sortValue(metric, a.totals);
		const bv = sortValue(metric, b.totals);
		if (av !== bv) return bv > av ? 1 : -1;
		return (
			STATE_ORDER[a.entry.state] - STATE_ORDER[b.entry.state] ||
			a.entry.name.localeCompare(b.entry.name) ||
			a.entry.id.localeCompare(b.entry.id)
		);
	});
}

/**
 * Requested but unused: the share of a request that the average usage did not touch, 0–100.
 * Undefined when nothing was requested or usage is unknown; usage above the request is 0, not a
 * negative share.
 */
export function requestedUnused(
	averageUsed: number | undefined,
	requested: number | undefined
): number | undefined {
	if (averageUsed === undefined || requested === undefined) return undefined;
	if (!Number.isFinite(averageUsed) || !(requested > 0)) return undefined;
	return Math.min(100, Math.max(0, 100 * (1 - averageUsed / requested)));
}

const FAILING = new Set<string>(FAILING_WAIT_REASONS);

export type Tone = 'ok' | 'warn' | 'bad';

/** A pod's status as the table writes it, and how serious it is. */
export function podStatus(pod: Pick<PodNow, 'phase' | 'ready' | 'waiting'>): {
	text: string;
	tone: Tone;
} {
	if (pod.waiting) {
		const reason = pod.waiting.replace(/^Init:/, '');
		return { text: pod.waiting, tone: FAILING.has(reason) ? 'bad' : 'warn' };
	}
	if (pod.phase === 'Failed') return { text: 'Failed', tone: 'bad' };
	if (pod.phase === 'Running') {
		return pod.ready ? { text: 'Running', tone: 'ok' } : { text: 'Not ready', tone: 'warn' };
	}
	if (pod.phase === 'Succeeded') return { text: 'Succeeded', tone: 'ok' };
	return { text: pod.phase || 'Unknown', tone: 'warn' };
}

/** The Pods table's order: most restarts first, then pods that are not running well, then by name. */
export function sortPods(pods: PodNow[]): PodNow[] {
	const trouble = (pod: PodNow) => (podStatus(pod).tone === 'ok' ? 1 : 0);
	return [...pods].sort(
		(a, b) =>
			Math.round(b.restarts) - Math.round(a.restarts) ||
			trouble(a) - trouble(b) ||
			a.pod.localeCompare(b.pod)
	);
}

/** The workloads behind the workspace's restarts, most restarts first. */
export function restartSources(rows: { entry: Entry; totals: Totals }[]): string[] {
	return rows
		.filter((row) => row.entry.id !== WORKSPACE_ID && row.totals.restarts > 0)
		.sort(
			(a, b) => b.totals.restarts - a.totals.restarts || a.entry.name.localeCompare(b.entry.name)
		)
		.map((row) => row.entry.name);
}

export type Volume = {
	name: string;
	used: number;
	capacity: number;
	/** Bytes per day over the last seven days; `null` when there is no trend to read. */
	growthPerDay: number | null;
	/** The pods that mount it. */
	pods: string[];
};

export type StorageSummary = {
	used: number;
	capacity: number;
	count: number;
	/** The volume that fills first, when one does within 30 days. */
	soonest?: { name: string; days: number };
};

/** Written and capacity over the volumes that report usage, and the one closest to full. */
export function storageSummary(volumes: Volume[]): StorageSummary {
	let soonest: StorageSummary['soonest'];
	for (const volume of volumes) {
		if (volume.growthPerDay === null) continue;
		const days = daysUntilFull(volume.capacity, volume.used, volume.growthPerDay);
		if (days === null || days > FULL_SOON_DAYS) continue;
		if (!soonest || days < soonest.days) soonest = { name: volume.name, days };
	}
	return {
		used: volumes.reduce((sum, v) => sum + v.used, 0),
		capacity: volumes.reduce((sum, v) => sum + v.capacity, 0),
		count: volumes.length,
		soonest
	};
}

/** The volumes a row counts: all of them for the workspace, those its pods mount for a workload. */
export function volumesOf(
	entryId: string,
	volumes: Volume[],
	owner: Map<string, string>
): Volume[] {
	if (entryId === WORKSPACE_ID) return volumes;
	return volumes.filter((volume) => volume.pods.some((pod) => owner.get(pod) === entryId));
}

/** One line of a chart: a value per timestamp (ms). */
export type Line = Map<number, number>;

/** Add up, or average, the series that `keep` accepts, timestamp by timestamp. */
export function mergeLines(
	series: Series[],
	keep: (labels: Record<string, string>) => boolean,
	how: 'sum' | 'avg' | 'max' = 'sum'
): Line {
	const sums = new Map<number, number>();
	const counts = new Map<number, number>();
	for (const s of series) {
		if (!keep(s.labels)) continue;
		for (const p of s.points) {
			const before = sums.get(p.t);
			sums.set(p.t, how === 'max' ? Math.max(before ?? -Infinity, p.v) : (before ?? 0) + p.v);
			counts.set(p.t, (counts.get(p.t) ?? 0) + 1);
		}
	}
	if (how !== 'avg') return sums;
	return new Map([...sums].map(([t, v]) => [t, v / (counts.get(t) ?? 1)]));
}

export function lineStats(line: Line | undefined): { avg?: number; peak?: number; last?: number } {
	if (!line || line.size === 0) return {};
	const times = [...line.keys()].sort((a, b) => a - b);
	const values = times.map((t) => line.get(t) ?? 0);
	return {
		avg: values.reduce((a, b) => a + b, 0) / values.length,
		peak: Math.max(...values),
		last: values[values.length - 1]
	};
}

/** A line's values in time order, for a sparkline. */
export function lineValues(line: Line | undefined): number[] {
	if (!line) return [];
	return [...line.keys()].sort((a, b) => a - b).map((t) => line.get(t) ?? 0);
}

/**
 * Rows for a chart from named lines: one row per timestamp, each line under its key, multiplied
 * by `scale` (to turn bytes into GiB, say). `constants` are levels drawn across the whole chart,
 * a quota for example.
 */
export function chartRows(
	lines: Record<string, Line | undefined>,
	scale = 1,
	constants: Record<string, number | undefined> = {}
): ({ date: Date } & Record<string, number | Date>)[] {
	const rows = new Map<number, { date: Date } & Record<string, number | Date>>();
	for (const [key, line] of Object.entries(lines)) {
		for (const [t, v] of line ?? []) {
			const row = rows.get(t) ?? { date: new Date(t) };
			row[key] = v * scale;
			rows.set(t, row);
		}
	}
	const out = [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
	for (const [key, value] of Object.entries(constants)) {
		if (value === undefined) continue;
		for (const row of out) row[key] = value * scale;
	}
	return out;
}

/**
 * The step of History's lines: a minute for an hour's window, five minutes for a day's, an hour
 * for a week's, so a chart never carries more than a few hundred points.
 */
export function historyStep(windowSeconds: number): number {
	if (windowSeconds <= 2 * 3600) return 60;
	if (windowSeconds <= 48 * 3600) return 300;
	return 3600;
}

/** How long one restart bar covers: an hour, except in a window too short or too long for that. */
export function restartBucket(windowSeconds: number): number {
	if (windowSeconds <= 3 * 3600) return 300;
	if (windowSeconds <= 3 * 86_400) return 3600;
	return 6 * 3600;
}

/** Restart bars from per-bucket samples: one per bucket from the window's start to its end. */
export function restartBars(
	line: Line,
	startMs: number,
	endMs: number,
	bucketSeconds: number
): { date: Date; end: Date; restarts: number }[] {
	const step = bucketSeconds * 1000;
	const bars: { date: Date; end: Date; restarts: number }[] = [];
	// A sample at time t counts the bucket that ends at t.
	for (let t = startMs + step; t <= endMs + 1; t += step) {
		let value = 0;
		for (const [at, v] of line) if (Math.abs(at - t) < step / 2) value = v;
		bars.push({ date: new Date(t - step), end: new Date(t), restarts: Math.round(value) });
	}
	return bars;
}

/** The group a name is drawn in when there are more names than colours. */
export const OTHER = '__other__';

/**
 * A colour slot per name that follows the name, not its rank: names in alphabetical order take
 * slots 0 to `slots - 1`, and the rest share `OTHER`.
 */
export function colourSlots(names: string[], slots = 4): Map<string, number | typeof OTHER> {
	const sorted = [...new Set(names)].sort((a, b) => a.localeCompare(b));
	return new Map(sorted.map((name, i) => [name, i < slots ? i : OTHER]));
}

export type HistoryKey =
	| 'cpuUse'
	| 'cpuReq'
	| 'cpuLim'
	| 'memUse'
	| 'memReq'
	| 'memLim'
	| 'restarts';

export type HistoryLines = Partial<Record<HistoryKey, Line>>;

/**
 * One row's lines over the window, from per-pod series added up. A key with no series for the row
 * is left out.
 */
export function entryLines(
	entryId: string,
	series: Partial<Record<HistoryKey, Series[]>>,
	owner: Map<string, string>
): HistoryLines {
	const keep = (labels: Record<string, string>) => inEntry(entryId, labels.pod ?? '', owner);
	const out: HistoryLines = {};
	for (const [key, list] of Object.entries(series) as [HistoryKey, Series[] | undefined][]) {
		if (!list) continue;
		const line = mergeLines(list, keep);
		if (line.size > 0) out[key] = line;
	}
	return out;
}

/**
 * One row's numbers over the window: CPU and memory are the averages of their lines. What has no
 * line comes from `now`: restarts over the window, the pods as they are at its end, and GPU, which
 * the shared scope only answers for the present.
 */
export function historyTotals(lines: HistoryLines, now: Totals): Totals {
	const avg = (key: HistoryKey) => lineStats(lines[key]).avg;
	return {
		cpu: { used: avg('cpuUse'), requested: avg('cpuReq'), limit: avg('cpuLim') },
		memory: { used: avg('memUse'), requested: avg('memReq'), limit: avg('memLim') },
		gpu: now.gpu,
		restarts: now.restarts,
		podsReady: now.podsReady,
		podsTotal: now.podsTotal
	};
}

/** One of a pod's GPU bookings: the card and the bytes the HAMi scheduler set aside on it. */
export type GpuDevice = { uuid: string; bytes: number };

/**
 * A pod's GPU numbers. What it has allocated is what the scheduler wrote on the pod. Usage and
 * utilisation are per card, so they count only on a card no other pod shares: on a shared card
 * nothing says whose they are, and the pod shows none rather than someone else's.
 *
 * @param usedByCard bytes in use per card, the shared scope's `vgpu-memory-used`
 * @param tenantsByCard pods per card, the shared scope's `gpu-shared-count`
 * @param utilByCard 0–100 per card, the shared scope's `gpu-util`
 */
export function podGpu(
	devices: GpuDevice[],
	usedByCard: Map<string, number>,
	tenantsByCard: Map<string, number>,
	utilByCard: Map<string, number>
): PodNow['gpu'] {
	if (devices.length === 0) return undefined;
	const cards = [...new Set(devices.map((device) => device.uuid))];
	let used: number | undefined;
	const utils: number[] = [];
	for (const card of cards) {
		if ((tenantsByCard.get(card) ?? 1) > 1) continue;
		const bytes = usedByCard.get(card);
		if (bytes !== undefined) used = (used ?? 0) + bytes;
		const util = utilByCard.get(card);
		if (util !== undefined) utils.push(util);
	}
	return {
		allocated: devices.reduce((sum, device) => sum + device.bytes, 0),
		used,
		util: utils.length > 0 ? utils.reduce((a, b) => a + b, 0) / utils.length : undefined,
		cards
	};
}

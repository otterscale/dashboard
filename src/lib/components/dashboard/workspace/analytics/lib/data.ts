import type { PrometheusDriver, QueryResult } from 'prometheus-query';

import {
	byLabel,
	fetchInstant,
	fetchRange,
	type Sample,
	type Series
} from '$lib/components/dashboard/kit/fetch';
import type { SharedMetrics } from '$lib/prometheus';

import { type PodNow, type Quota, quotaOf, type Volume } from './model';
import {
	podStateQueries,
	quotaQuery,
	restartQueries,
	usageQueries,
	volumeFillQuery,
	volumeQueries
} from './queries';

// One request per card group, so a group that fails leaves the others on screen.

const byPod = (samples: Sample[] | undefined) => byLabel(samples, 'pod');

function labelByPod(samples: Sample[] | undefined, label: string): Map<string, string> {
	const out = new Map<string, string>();
	for (const s of samples ?? []) {
		if (s.labels.pod && s.labels[label] && !out.has(s.labels.pod)) {
			out.set(s.labels.pod, s.labels[label]);
		}
	}
	return out;
}

export type PodFacts = { pods: Omit<PodNow, 'gpu'>[]; quota: Quota };

/** Every pod in the namespace with its state, CPU, memory and restarts over `restartRange`. */
export async function fetchPods(
	client: PrometheusDriver,
	namespace: string,
	restartRange: string,
	time?: Date
): Promise<PodFacts | null> {
	const r = await fetchInstant(
		client,
		{
			...podStateQueries(namespace),
			...usageQueries(namespace),
			...restartQueries(namespace, restartRange),
			quota: quotaQuery(namespace)
		} as Record<string, string>,
		time
	);
	if (!r) return null;
	const phase = labelByPod(r.phase, 'phase');
	const ready = byPod(r.ready);
	const waiting = labelByPod(r.waiting, 'reason');
	const initWaiting = labelByPod(r.initWaiting, 'reason');
	const lastReason = labelByPod(r.lastReason, 'reason');
	const initLastReason = labelByPod(r.initLastReason, 'reason');
	const exitCode = byPod(r.exitCode);
	const restarts = byPod(r.restarts);
	const initRestarts = byPod(r.initRestarts);
	const [cpuUse, cpuReq, cpuLim, memUse, memReq, memLim] = (
		['cpuUse', 'cpuReq', 'cpuLim', 'memUse', 'memReq', 'memLim'] as const
	).map((k) => byPod(r[k]));
	const pods = r.pods
		.filter((s) => s.labels.pod)
		.map(({ labels }) => {
			const pod = labels.pod;
			const init = initWaiting.get(pod);
			return {
				pod,
				node: labels.node ?? '',
				phase: phase.get(pod) ?? '',
				ready: ready.get(pod) === 1,
				// An init container that waits holds the pod back before any container starts.
				waiting: init ? `Init:${init}` : waiting.get(pod),
				restarts: (restarts.get(pod) ?? 0) + (initRestarts.get(pod) ?? 0),
				cpu: { used: cpuUse.get(pod), requested: cpuReq.get(pod), limit: cpuLim.get(pod) },
				memory: { used: memUse.get(pod), requested: memReq.get(pod), limit: memLim.get(pod) },
				lastReason: lastReason.get(pod) ?? initLastReason.get(pod),
				exitCode: exitCode.get(pod)
			};
		});
	return { pods, quota: quotaOf(byLabel(r.quota, 'resource')) };
}

export type GpuCards = {
	used: Map<string, number>;
	tenants: Map<string, number>;
	util: Map<string, number>;
};

function byCard(result: QueryResult | undefined): Map<string, number> {
	const out = new Map<string, number>();
	for (const s of (result?.result ?? []) as {
		metric: { labels: Record<string, string> };
		value?: { value: number };
	}[]) {
		const card = s.metric.labels.device_uuid ?? s.metric.labels.UUID;
		const value = Number(s.value?.value);
		if (card && Number.isFinite(value)) out.set(card, value);
	}
	return out;
}

/**
 * Per-card GPU numbers for the cards this workspace's pods are booked on, from the server's
 * shared queries. Utilisation is asked for those cards only; without any there is nothing to ask.
 */
export async function fetchGpuCards(
	shared: SharedMetrics,
	cards: string[]
): Promise<GpuCards | null> {
	if (cards.length === 0) return { used: new Map(), tenants: new Map(), util: new Map() };
	try {
		const [used, tenants, util] = await Promise.all([
			shared.instant('vgpu-memory-used'),
			shared.instant('gpu-shared-count'),
			shared.instant('gpu-util', { uuid: cards })
		]);
		return { used: byCard(used), tenants: byCard(tenants), util: byCard(util) };
	} catch (error) {
		console.warn('Analytics GPU query failed:', error);
		return null;
	}
}

export async function fetchVolumes(
	client: PrometheusDriver,
	namespace: string,
	time?: Date
): Promise<Volume[] | null> {
	const r = await fetchInstant(client, volumeQueries(namespace), time);
	if (!r) return null;
	const capacity = byLabel(r.pvcCapacity, 'persistentvolumeclaim');
	const growth = byLabel(r.pvcGrowth, 'persistentvolumeclaim');
	const mounts = new Map<string, string[]>();
	for (const s of r.pvcMounts) {
		const { pod, persistentvolumeclaim: claim } = s.labels;
		if (pod && claim) mounts.set(claim, [...(mounts.get(claim) ?? []), pod]);
	}
	return r.pvcUsed
		.filter((s) => s.labels.persistentvolumeclaim)
		.map((s) => {
			const name = s.labels.persistentvolumeclaim;
			return {
				name,
				used: s.value,
				capacity: capacity.get(name) ?? 0,
				growthPerDay: growth.get(name) ?? null,
				pods: mounts.get(name) ?? []
			};
		})
		.filter((volume) => volume.capacity > 0)
		.sort((a, b) => a.name.localeCompare(b.name));
}

export type UsageHistory = Record<
	'cpuUse' | 'cpuReq' | 'cpuLim' | 'memUse' | 'memReq' | 'memLim',
	Series[]
>;

export function fetchUsageHistory(
	client: PrometheusDriver,
	namespace: string,
	start: Date,
	end: Date,
	step: number
): Promise<UsageHistory | null> {
	return fetchRange(
		client,
		usageQueries(namespace),
		start,
		end,
		step
	) as Promise<UsageHistory | null>;
}

/** Restarts per pod in each bucket; a sample at time t counts the bucket that ends at t. */
export async function fetchRestartHistory(
	client: PrometheusDriver,
	namespace: string,
	start: Date,
	end: Date,
	bucketSeconds: number
): Promise<Series[] | null> {
	const first = new Date(start.getTime() + bucketSeconds * 1000);
	const r = await fetchRange(
		client,
		restartQueries(namespace, `${bucketSeconds}s`),
		first,
		end,
		bucketSeconds
	);
	return r ? [...r.restarts, ...r.initRestarts] : null;
}

export async function fetchVolumeHistory(
	client: PrometheusDriver,
	namespace: string,
	start: Date,
	end: Date,
	step: number
): Promise<Series[] | null> {
	const r = await fetchRange(client, { fill: volumeFillQuery(namespace) }, start, end, step);
	return r ? r.fill : null;
}

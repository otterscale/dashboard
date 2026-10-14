import type { InstantVector } from 'prometheus-query';

import type { SharedMetrics, SharedParams, SharedQueryName } from '$lib/prometheus';

import type { GpuAllocatedTotal, GpuUtilization } from './types';

/**
 * Measured per-card usage from the DCGM exporter, joined to HAMi's device ids.
 *
 * HAMi only ever reports what the *scheduler* booked — `hami.io/node-nvidia-register`
 * capacity and `hami.io/vgpu-devices-allocated` reservations. Neither says whether a
 * card is doing any work. DCGM measures the hardware, and its `UUID` label is the same
 * GPU UUID HAMi uses as a device id, so the two line up per card without a join key of
 * our own.
 *
 * Nothing here is attributable to a pod: DCGM's `pod`/`namespace` labels belong to the
 * exporter, not the workload on the card (see `classifyGpuGovernance` in $lib/prometheus).
 */

/** GPU UUIDs as the server accepts them (proxy_shared.go); refuse anything else rather than send it. */
const SAFE_UUID = /^[A-Za-z0-9_.:-]{1,128}$/;
/** The server takes at most this many values per parameter. */
const MAX_UUIDS_PER_REQUEST = 256;
const BYTES_PER_MIB = 1024 * 1024;

/**
 * The server forwards a shared query as GET, with the PromQL it builds in the
 * URL, and refuses with 400 a request whose path and encoded query together
 * are longer than this (proxy_shared.go).
 */
const SERVER_URI_LIMIT = 6144;
/**
 * What a request costs before any UUID: the agent's path, `query=` with the
 * template, `&time=`. gpu-fb-total, the longest, measures 325 bytes with an
 * empty matcher; this leaves room for a longer path or timestamp.
 */
const URI_OVERHEAD = 512;
/** Kept free below the limit, against a template that grows a little. */
const URI_MARGIN = 512;
/** gpu-fb-total names the UUID matcher five times; gpu-util and gpu-fb-used once. */
const UUID_MATCHERS_PER_QUERY = 5;
/** Bytes each matcher may hold: (6144 - 512 - 512) / 5 = 1024. */
const MATCHER_BUDGET = Math.floor(
	(SERVER_URI_LIMIT - URI_OVERHEAD - URI_MARGIN) / UUID_MATCHERS_PER_QUERY
);
/** The `|` that joins two values, as %7C. */
const SEPARATOR_BYTES = 3;

/**
 * Bytes one value adds to a matcher once the server has escaped it the way
 * sharedMatcher does — regexp.QuoteMeta, then a quoted PromQL string — and
 * the query string is URL-encoded: `.` turns into `%5C%5C.`, `:` into `%3A`.
 */
export function encodedMatcherValueBytes(value: string): number {
	const quoted = value.replace(/[\\.+*?()|[\]{}^$]/g, '\\$&').replace(/[\\"]/g, '\\$&');
	let bytes = 0;
	for (const ch of quoted) bytes += /[A-Za-z0-9\-_.~]/.test(ch) ? 1 : 3;
	return bytes;
}

/**
 * Split UUIDs into requests the server accepts: each matcher stays within
 * MATCHER_BUDGET once encoded, so the longest query stays well under
 * SERVER_URI_LIMIT, and no request names more than MAX_UUIDS_PER_REQUEST.
 */
export function batchUuids(uuids: string[]): string[][] {
	const batches: string[][] = [];
	let batch: string[] = [];
	let bytes = 0;
	for (const uuid of uuids) {
		const cost = encodedMatcherValueBytes(uuid) + SEPARATOR_BYTES;
		if (
			batch.length > 0 &&
			(bytes + cost > MATCHER_BUDGET || batch.length >= MAX_UUIDS_PER_REQUEST)
		) {
			batches.push(batch);
			batch = [];
			bytes = 0;
		}
		batch.push(uuid);
		bytes += cost;
	}
	if (batch.length > 0) batches.push(batch);
	return batches;
}

/** One shared instant query, reduced to value-by-label. A failure yields an empty map, never throws. */
async function instantBy(
	shared: SharedMetrics,
	name: SharedQueryName,
	label: string,
	params?: SharedParams
): Promise<Map<string, number>> {
	const values = new Map<string, number>();
	try {
		const response = await shared.instant(name, params);
		for (const series of response.result as InstantVector[]) {
			const key = (series.metric.labels as Record<string, string>)[label];
			const value = Number(series.value?.value);
			if (key && Number.isFinite(value)) values.set(key, value);
		}
	} catch (error) {
		console.warn(`Failed to query ${name}:`, error);
	}
	return values;
}

/** instantBy over a list of UUIDs, in requests the server accepts. */
async function instantByUuid(
	shared: SharedMetrics,
	name: SharedQueryName,
	uuids: string[]
): Promise<Map<string, number>> {
	const maps = await Promise.all(
		batchUuids(uuids).map((uuid) => instantBy(shared, name, 'UUID', { uuid }))
	);
	return new Map(maps.flatMap((map) => [...map]));
}

/**
 * Fetch compute and memory usage for the given GPU device ids.
 *
 * Returns an entry only for cards DCGM actually reported, so callers can tell "idle"
 * from "not measured" and render the plain allocation view for the latter.
 */
export async function fetchGpuUtilization(
	shared: SharedMetrics,
	deviceIds: string[]
): Promise<Map<string, GpuUtilization>> {
	const uuids = [...new Set(deviceIds)].filter((id) => SAFE_UUID.test(id));
	const result = new Map<string, GpuUtilization>();
	if (uuids.length === 0) return result;

	// The server takes the max for the percentage and sums the byte counts: a
	// MIG-partitioned card emits one series per instance, whose memory adds up but
	// whose utilization does not. DCGM reports frame buffer in MiB, the unit the rest
	// of this module already speaks.
	const [compute, usedMem, totalMem] = await Promise.all([
		instantByUuid(shared, 'gpu-util', uuids),
		instantByUuid(shared, 'gpu-fb-used', uuids),
		instantByUuid(shared, 'gpu-fb-total', uuids)
	]);

	for (const uuid of uuids) {
		const utilization: GpuUtilization = {
			compute: compute.get(uuid),
			usedMem: usedMem.get(uuid),
			totalMem: totalMem.get(uuid)
		};
		if (Object.values(utilization).some((v) => v !== undefined)) result.set(uuid, utilization);
	}
	return result;
}

/**
 * What hami-scheduler has booked on every card, across all workloads, keyed by
 * GPU UUID. For viewers who may not list other tenants' pods: the diagram can
 * still show how full a card is without naming who fills it. Empty on failure.
 */
export async function fetchGpuAllocatedTotals(
	shared: SharedMetrics
): Promise<Map<string, GpuAllocatedTotal>> {
	const [memory, shareCount] = await Promise.all([
		instantBy(shared, 'gpu-allocated-memory', 'device_uuid'),
		instantBy(shared, 'gpu-shared-count', 'device_uuid')
	]);
	const totals = new Map<string, GpuAllocatedTotal>();
	for (const [uuid, bytes] of memory) {
		totals.set(uuid, { usedMem: bytes / BYTES_PER_MIB, shareCount: shareCount.get(uuid) ?? 0 });
	}
	return totals;
}

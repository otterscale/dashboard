import type { PrometheusDriver } from 'prometheus-query';

import type { GpuUtilization } from './types';

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

/** GPU UUIDs are `GPU-<uuid>`; refuse anything else rather than build a regex from it. */
const SAFE_UUID = /^[A-Za-z0-9_.:-]+$/;

/** One instant query, reduced to value-by-UUID. A failure yields an empty map, never throws. */
async function instantByUuid(
	client: PrometheusDriver,
	query: string
): Promise<Map<string, number>> {
	const values = new Map<string, number>();
	try {
		const response = await client.instantQuery(query);
		for (const series of response.result) {
			const uuid = (series.metric.labels as Record<string, string>).UUID;
			const value = Number(series.value?.value);
			if (uuid && Number.isFinite(value)) values.set(uuid, value);
		}
	} catch {
		console.warn('Failed to query GPU utilization:', query);
	}
	return values;
}

/**
 * Fetch compute and memory usage for the given GPU device ids.
 *
 * Returns an entry only for cards DCGM actually reported, so callers can tell "idle"
 * from "not measured" and render the plain allocation view for the latter.
 */
export async function fetchGpuUtilization(
	client: PrometheusDriver,
	deviceIds: string[]
): Promise<Map<string, GpuUtilization>> {
	const uuids = [...new Set(deviceIds)].filter((id) => SAFE_UUID.test(id));
	const result = new Map<string, GpuUtilization>();
	if (uuids.length === 0) return result;

	const selector = `UUID=~"${uuids.join('|')}"`;

	// `max` for the percentage, `sum` for the byte counts: a MIG-partitioned card emits one
	// series per instance, whose memory adds up but whose utilization does not. Non-MIG cards
	// emit exactly one series either way. DCGM reports frame buffer in MiB — the unit the rest
	// of this module already speaks — so no conversion is needed.
	const [compute, usedMem, totalMem] = await Promise.all([
		instantByUuid(client, `max by (UUID) (DCGM_FI_DEV_GPU_UTIL{${selector}})`),
		instantByUuid(client, `sum by (UUID) (DCGM_FI_DEV_FB_USED{${selector}})`),
		instantByUuid(
			client,
			// FB_RESERVED is the driver's own allocation; it belongs in the card's total but not
			// in what workloads use. Older exporters omit it, and one missing operand would empty
			// the whole sum — hence the two-term fallback.
			`sum by (UUID) (DCGM_FI_DEV_FB_USED{${selector}} + DCGM_FI_DEV_FB_FREE{${selector}}` +
				` + DCGM_FI_DEV_FB_RESERVED{${selector}})` +
				` or sum by (UUID) (DCGM_FI_DEV_FB_USED{${selector}} + DCGM_FI_DEV_FB_FREE{${selector}})`
		)
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

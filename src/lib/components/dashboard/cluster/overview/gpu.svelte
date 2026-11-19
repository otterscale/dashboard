<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		DCGM_GPU_MEMORY_TOTAL_BYTES,
		DCGM_GPU_MEMORY_USED_BYTES,
		fetchCombinedInstantOrNull
	} from '$lib/prometheus';

	import ResourceCard from './resource-card.svelte';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	function finite(value: unknown): number | undefined {
		const n = Number(value);
		return value !== undefined && value !== null && Number.isFinite(n) ? n : undefined;
	}

	// Both ratios share the DCGM physical total so the meters are comparable: the gap between
	// them is the point of this card. HAMi's `hami_gpu_memory_limit_bytes` is the scheduler's
	// pool, which `deviceMemoryScaling` can inflate past the real card, so `allocated` may
	// legitimately exceed 100%.
	//
	// No `or vector(0)` on either numerator: an absent sum means that stack is not deployed, and
	// a substituted 0 would read as "0% allocated" on a cluster that simply has no HAMi.
	const gpu = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					allocatedPct: `100 * sum(hami_gpu_memory_allocated_bytes) / sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
					usedPct: `100 * sum(${DCGM_GPU_MEMORY_USED_BYTES}) / sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
					totalBytes: `sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
					utilizationPct: `avg(DCGM_FI_DEV_GPU_UTIL)`
				})
			);
			// Gate on physical capacity: it exists whenever DCGM sees a card, so an idle cluster
			// still renders 0% instead of an empty state.
			if (r.totalBytes[0]?.value?.value == null) return null;
			return {
				// A non-numeric sample would reach formatCapacity() and print "NaN KB".
				totalBytes: finite(r.totalBytes[0]?.value?.value),
				// Booked by the HAMi scheduler; undefined on clusters without the vGPU stack.
				allocatedPct: finite(r.allocatedPct[0]?.value?.value),
				// Measured on the card by DCGM: the numbers a workload cannot hide from.
				usedPct: finite(r.usedPct[0]?.value?.value),
				// Shares the 0-100 scale with the memory ratios but answers a different question.
				utilizationPct: finite(r.utilizationPct[0]?.value?.value)
			};
		},
		() => isReloading
	);

	const total = $derived(
		gpu.data?.totalBytes === undefined ? undefined : formatCapacity(gpu.data.totalBytes)
	);
</script>

<ResourceCard
	title={m.gpu()}
	description={m.cluster_dashboard_gpu_description()}
	info={m.cluster_dashboard_gpu_memory_tooltip()}
	status={gpu.status}
	stale={gpu.stale}
	emptyTitle={m.dash_no_gpu()}
	capacity={total ? String(total.value) : '—'}
	unit={total?.unit}
	capacityLabel={m.dash_capacity()}
>
	{#if gpu.data?.allocatedPct !== undefined}
		<Meter label={m.gpu_allocated()} percent={gpu.data.allocatedPct} swatch="bg-chart-2" />
	{/if}
	<Meter label={m.usage()} percent={gpu.data?.usedPct ?? 0} swatch="bg-chart-1" />
	<!-- Uncoloured: a busy GPU is the goal, so the pressure thresholds don't apply. -->
	<Meter
		label={m.utilization()}
		percent={gpu.data?.utilizationPct ?? 0}
		level="neutral"
		swatch="bg-chart-4"
	/>
</ResourceCard>

<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import ResourceCard from '$lib/components/dashboard/shared/resource-card.svelte';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		DCGM_GPU_MEMORY_TOTAL_BYTES,
		DCGM_GPU_MEMORY_USED_BYTES,
		fetchCombinedInstant
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Booked by the HAMi scheduler; undefined on clusters without the vGPU stack.
	let allocatedPct: number | undefined = $state(undefined);
	// Measured on the card by DCGM — the numbers a workload cannot hide from.
	let usedPct: number | undefined = $state(undefined);
	let totalBytes: number | undefined = $state(undefined);
	// Shares the 0–100 scale with the memory ratios but answers a different question, so it gets
	// its own ring and color.
	let utilizationPct: number | undefined = $state(undefined);

	// Both ratios share the DCGM physical total so the rings are comparable — the gap between
	// them is the point of this card. HAMi's `hami_gpu_memory_limit_bytes` is the scheduler's
	// pool, which `deviceMemoryScaling` can inflate past the real card, so `allocated` may
	// legitimately exceed 100% (the arc clamps, the legend does not).
	//
	// No `or vector(0)` on either numerator: an absent sum means that stack is not deployed, and
	// a substituted 0 would read as "0% allocated" on a cluster that simply has no HAMi.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				allocatedPct: `100 * sum(hami_gpu_memory_allocated_bytes) / sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
				usedPct: `100 * sum(${DCGM_GPU_MEMORY_USED_BYTES}) / sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
				totalBytes: `sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
				utilizationPct: `avg(DCGM_FI_DEV_GPU_UTIL)`
			});
			allocatedPct = r.allocatedPct[0]?.value?.value ?? undefined;
			usedPct = r.usedPct[0]?.value?.value ?? undefined;
			totalBytes = r.totalBytes[0]?.value?.value ?? undefined;
			utilizationPct = r.utilizationPct[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch GPU usage:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	// A non-numeric sample would reach formatCapacity() and print "NaN KB".
	const capacity = $derived.by(() => {
		const total = Number(totalBytes);
		if (!Number.isFinite(total)) return { value: '—' };
		const { value, unit } = formatCapacity(total);
		return { value, unit };
	});
</script>

<!-- Gate on physical capacity: it exists whenever DCGM sees a card, so an idle cluster still
     renders 0% instead of an empty state. -->
<ResourceCard
	title={m.gpu()}
	description={m.cluster_dashboard_gpu_description()}
	tooltip={m.cluster_dashboard_gpu_memory_tooltip()}
	state={!isLoaded
		? 'loading'
		: totalBytes === undefined || totalBytes === null
			? 'empty'
			: 'ready'}
	total={capacity}
	rows={[
		{ label: m.gpu_allocated(), percent: allocatedPct },
		{ label: m.usage(), percent: Number(usedPct ?? 0) },
		// A busy GPU is the goal, so the pressure thresholds don't apply.
		{ label: m.utilization(), percent: Number(utilizationPct ?? 0), kind: 'neutral' }
	]}
/>

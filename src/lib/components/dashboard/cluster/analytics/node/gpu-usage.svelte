<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { dcgmNodeSelector } from '$lib/prometheus';

	import HeatmapChartGpu from './gpu-heatmap.svelte';

	// GPU detail for the selected node. Self-gating: probes DCGM and renders nothing on
	// CPU-only nodes. The probe tracks `nodeName` (not just mount) because the parent
	// resolves it asynchronously, so a mount-only probe could miss the correction.
	let {
		client,
		// k8s node name == DCGM `Hostname` (see dcgmNodeSelector in prometheus.ts).
		nodeName,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		nodeName: string | undefined;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	let hasGpu = $state(false);

	$effect(() => {
		const node = nodeName;
		if (!node) {
			hasGpu = false;
			return;
		}
		let cancelled = false;
		client
			.instantQuery(`count(DCGM_FI_DEV_GPU_UTIL{${dcgmNodeSelector(node)}})`)
			.then((response) => {
				if (!cancelled) hasGpu = Number(response.result?.[0]?.value?.value ?? 0) > 0;
			})
			.catch(() => {
				if (!cancelled) hasGpu = false;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if hasGpu && nodeName}
	<!-- GPU detail (DCGM, per-card): heatmaps — one row per card — stay readable at any card count -->
	<div class="grid w-full gap-4 lg:grid-cols-2">
		<HeatmapChartGpu {client} {nodeName} metric="util" {start} {end} {endIsNow} bind:isReloading />
		<HeatmapChartGpu
			{client}
			{nodeName}
			metric="memory"
			{start}
			{end}
			{endIsNow}
			bind:isReloading
		/>
		<HeatmapChartGpu {client} {nodeName} metric="power" {start} {end} {endIsNow} bind:isReloading />
		<HeatmapChartGpu {client} {nodeName} metric="temp" {start} {end} {endIsNow} bind:isReloading />
	</div>
{/if}

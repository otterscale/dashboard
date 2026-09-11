<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import GpuIcon from '@lucide/svelte/icons/gpu';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import ThermometerIcon from '@lucide/svelte/icons/thermometer';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/messages';
	import { classifyThreshold, fetchCombinedInstant, thresholdClasses } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let consumption: number | undefined = $state(undefined);
	// Hottest card in the cluster, not the average: a single throttling GPU is the thing worth
	// surfacing, and an average across a large fleet would bury it.
	let temperature: number | undefined = $state(undefined);
	// The denominator for the draw: 2 kW means very different things across 2 cards and 16.
	let cardCount: number | undefined = $state(undefined);

	async function fetchConsumption() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				power: `sum(DCGM_FI_DEV_POWER_USAGE)`,
				temperature: `max(DCGM_FI_DEV_GPU_TEMP)`,
				// Deduped by UUID: a second dcgm-exporter scrape target would otherwise double it.
				cardCount: `count(count by (UUID) (DCGM_FI_DEV_FB_USED))`
			});
			consumption = r.power[0]?.value?.value ?? undefined;
			temperature = r.temperature[0]?.value?.value ?? undefined;
			cardCount = r.cardCount[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch GPU power usage:', error);
		}
	}

	const reloadManager = new ReloadManager(fetchConsumption);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetchConsumption();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	// Kept subordinate to the power reading until it matters: muted while normal, and only
	// picking up the shared warning/critical colors once the card is near throttling.
	const temperatureClass = $derived.by(() => {
		if (temperature === undefined || !Number.isFinite(temperature)) return 'text-muted-foreground';
		const level = classifyThreshold(temperature, { green: 80, orange: 90 });
		return level === 'green' ? 'text-muted-foreground' : thresholdClasses(level).text;
	});
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<InfoIcon
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header>
		<Card.Title>{m.gpu_power_usage()}</Card.Title>
		<Card.Description class="text-md flex h-6 items-center"
			>{m.cluster_dashboard_gpu_power_usage_description()}</Card.Description
		>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
		<!-- `undefined`, not falsy: an idle fleet legitimately draws ~0 W and must still render. -->
	{:else if consumption === undefined}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="flex flex-wrap items-baseline gap-x-4 gap-y-1">
			<p class="text-3xl">{(Number(consumption) / 1000).toFixed(2)} kW</p>
			{#if cardCount !== undefined}
				<!-- Uncolored: an inventory count, not a signal that can go wrong. -->
				<p class="flex items-center gap-1 text-sm whitespace-nowrap text-muted-foreground">
					<GpuIcon class="size-4 shrink-0" />
					{m.gpu_cards()}
					{Math.round(Number(cardCount))}
				</p>
			{/if}
			{#if temperature !== undefined}
				<p class="flex items-center gap-1 text-sm whitespace-nowrap {temperatureClass}">
					<ThermometerIcon class="size-4 shrink-0" />
					{m.gpu_peak()}
					{Math.round(Number(temperature))} °C
				</p>
			{/if}
		</Card.Content>
	{/if}
</Card.Root>

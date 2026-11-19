<script lang="ts">
	import GpuIcon from '@lucide/svelte/icons/gpu';
	import ThermometerIcon from '@lucide/svelte/icons/thermometer';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { fetchCombinedOrThrow } from '$lib/components/dashboard/shared/query';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { m } from '$lib/messages';
	import { classifyThreshold, thresholdClasses } from '$lib/prometheus';

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

	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetchConsumption() {
		try {
			const r = await fetchCombinedOrThrow(prometheusDriver, {
				power: `sum(DCGM_FI_DEV_POWER_USAGE)`,
				temperature: `max(DCGM_FI_DEV_GPU_TEMP)`,
				// Deduped by UUID: a second dcgm-exporter scrape target would otherwise double it.
				cardCount: `count(count by (UUID) (DCGM_FI_DEV_FB_USED))`
			});
			consumption = r.power[0]?.value?.value ?? undefined;
			temperature = r.temperature[0]?.value?.value ?? undefined;
			cardCount = r.cardCount[0]?.value?.value ?? undefined;
			failed = false;
		} catch (error) {
			failed = true;
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

<!-- `undefined`, not falsy: an idle fleet legitimately draws ~0 W and must still render. -->
<StatTile
	label={m.gpu_power_usage()}
	state={!isLoaded ? 'loading' : failed ? 'error' : consumption === undefined ? 'empty' : 'ready'}
	onretry={fetchConsumption}
	value={(Number(consumption) / 1000).toFixed(2)}
	unit="kW"
>
	{#if cardCount !== undefined || temperature !== undefined}
		<p class="flex min-h-5 flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
			{#if cardCount !== undefined}
				<!-- Uncolored: an inventory count, not a signal that can go wrong. -->
				<span class="flex items-center gap-1 whitespace-nowrap text-muted-foreground">
					<GpuIcon class="size-3.5 shrink-0" />
					{m.gpu_cards()}
					{Math.round(Number(cardCount))}
				</span>
			{/if}
			{#if temperature !== undefined}
				<span class="flex items-center gap-1 whitespace-nowrap {temperatureClass}">
					<ThermometerIcon class="size-3.5 shrink-0" />
					{m.gpu_peak()}
					{Math.round(Number(temperature))} °C
				</span>
			{/if}
		</p>
	{/if}
</StatTile>

<script lang="ts">
	import GpuIcon from '@lucide/svelte/icons/gpu';
	import ThermometerIcon from '@lucide/svelte/icons/thermometer';
	import ZapIcon from '@lucide/svelte/icons/zap';
	import type { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { levelOf, levelText } from '$lib/components/dashboard/shared/status';
	import { m } from '$lib/messages';
	import { fetchCombinedInstantOrNull } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	function finite(value: unknown): number | undefined {
		const n = Number(value);
		return value !== undefined && value !== null && Number.isFinite(n) ? n : undefined;
	}

	const consumption = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					power: `sum(DCGM_FI_DEV_POWER_USAGE)`,
					temperature: `max(DCGM_FI_DEV_GPU_TEMP)`,
					// Deduped by UUID: a second dcgm-exporter scrape target would otherwise double it.
					cardCount: `count(count by (UUID) (DCGM_FI_DEV_FB_USED))`
				})
			);
			// `undefined`, not falsy: an idle fleet legitimately draws ~0 W and must still render.
			const power = finite(r.power[0]?.value?.value);
			if (power === undefined) return null;
			return {
				power,
				// Hottest card in the cluster, not the average: a single throttling GPU is the thing
				// worth surfacing, and an average across a large fleet would bury it.
				temperature: finite(r.temperature[0]?.value?.value),
				// The denominator for the draw: 2 kW means very different things across 2 cards and 16.
				cardCount: finite(r.cardCount[0]?.value?.value)
			};
		},
		() => isReloading
	);

	// Muted while normal; the warning and danger colours only once the card is near throttling.
	const temperatureClass = $derived.by(() => {
		const temperature = consumption.data?.temperature;
		if (temperature === undefined) return '';
		const level = levelOf(temperature, { warn: 80, danger: 90 });
		return level === 'ok' ? '' : cn('font-medium', levelText[level]);
	});
</script>

<StatCard
	label={m.gpu_power_usage()}
	icon={ZapIcon}
	status={consumption.status}
	stale={consumption.stale}
>
	<span class="truncate">{((consumption.data?.power ?? 0) / 1000).toFixed(2)} kW</span>
	{#snippet detail()}
		<span class="flex flex-wrap items-center gap-x-3 gap-y-0.5">
			{#if consumption.data?.cardCount !== undefined}
				<!-- Uncoloured: an inventory count, not a signal that can go wrong. -->
				<span class="flex items-center gap-1 whitespace-nowrap">
					<GpuIcon class="size-3.5 shrink-0" aria-hidden="true" />
					{m.gpu_cards()}
					{Math.round(consumption.data.cardCount)}
				</span>
			{/if}
			{#if consumption.data?.temperature !== undefined}
				<span class={cn('flex items-center gap-1 whitespace-nowrap', temperatureClass)}>
					<ThermometerIcon class="size-3.5 shrink-0" aria-hidden="true" />
					{m.gpu_peak()}
					{Math.round(consumption.data.temperature)} °C
				</span>
			{/if}
		</span>
	{/snippet}
</StatCard>

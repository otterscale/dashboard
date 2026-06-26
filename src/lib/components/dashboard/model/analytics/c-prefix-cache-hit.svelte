<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import {
		computeStep,
		fetchMultipleFlattenedRange,
		vllmMetricWithSelector
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		selectedModel,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();

	type Row = { date: Date; l1: number; l2?: number; l3?: number };

	let data = $state<Row[]>([]);
	// L2 LMCache / L3 Mooncake tiers only exist when KV Cache Offload is enabled (AI100).
	// Render each series only when its metric actually returns data, so models without
	// an offload tier show just the L1 line instead of misleading flat-0% L2/L3 lines.
	let hasL2 = $state(false);
	let hasL3 = $state(false);
	let isLoaded = $state(false);

	function queries(): Record<string, string> {
		const l1Hits = vllmMetricWithSelector('vllm:prefix_cache_hits_total', namespace, selectedModel);
		const l1Queries = vllmMetricWithSelector(
			'vllm:prefix_cache_queries_total',
			namespace,
			selectedModel
		);
		const l2Hits = vllmMetricWithSelector('lmcache:num_hit_tokens_total', namespace, selectedModel);
		const l2Requested = vllmMetricWithSelector(
			'lmcache:num_requested_tokens_total',
			namespace,
			selectedModel
		);
		const l3Hits = vllmMetricWithSelector(
			'vllm:external_prefix_cache_hits_total',
			namespace,
			selectedModel
		);
		const l3Queries = vllmMetricWithSelector(
			'vllm:external_prefix_cache_queries_total',
			namespace,
			selectedModel
		);
		return {
			l1: `sum(rate(${l1Hits}[5m])) / sum(rate(${l1Queries}[5m])) * 100`,
			l2: `sum(rate(${l2Hits}[5m])) / sum(rate(${l2Requested}[5m])) * 100`,
			l3: `sum(rate(${l3Hits}[5m])) / sum(rate(${l3Queries}[5m])) * 100`
		};
	}

	const configuration = {
		l1: { label: m.cache_l1_vllm(), color: 'var(--chart-2)' },
		l2: { label: m.cache_l2_lmcache(), color: 'var(--chart-1)' },
		l3: { label: m.cache_l3_mooncake(), color: 'var(--chart-3)' }
	} satisfies Chart.ChartConfig;

	const areaProps = {
		curve: curveMonotoneX,
		'fill-opacity': 0.4,
		line: { class: 'stroke-1' },
		motion: 'tween'
	} as const;

	async function fetch() {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const points = await fetchMultipleFlattenedRange(
				prometheusDriver,
				queries(),
				new Date(startMs),
				new Date(endMs),
				computeStep(startMs, endMs)
			);
			hasL2 = points.some((p) => Number.isFinite(Number(p.l2)));
			hasL3 = points.some((p) => Number.isFinite(Number(p.l3)));
			data = points.map((p) => ({
				date: p.date as Date,
				l1: Number.isFinite(Number(p.l1)) ? Number(p.l1) : 0,
				...(hasL2 ? { l2: Number.isFinite(Number(p.l2)) ? Number(p.l2) : 0 } : {}),
				...(hasL3 ? { l3: Number.isFinite(Number(p.l3)) ? Number(p.l3) : 0 } : {})
			}));
		} catch {
			data = [];
			hasL2 = false;
			hasL3 = false;
		}
	}

	const reloadManager = new ReloadManager(fetch);

	onMount(() => {
		fetch().then(() => (isLoaded = true));
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	const series = $derived(
		[
			{ key: 'l1', label: configuration.l1.label, color: configuration.l1.color },
			...(hasL2
				? [{ key: 'l2', label: configuration.l2.label, color: configuration.l2.color }]
				: []),
			...(hasL3
				? [{ key: 'l3', label: configuration.l3.label, color: configuration.l3.color }]
				: [])
		].map((s) => ({ ...s }))
	);
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{m.cache_hit_by_tier()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{m.llm_dashboard_cache_tiers_description()}
			</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.llm_dashboard_cache_tiers_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if data.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					{data}
					x="date"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					{series}
					props={{
						area: areaProps,
						xAxis: {
							format: (v: Date) =>
								`${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`
						},
						yAxis: { format: (v: number) => `${v}%` }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip
							indicator="dot"
							labelFormatter={(v: Date) =>
								v.toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: 'numeric'
								})}
						>
							{#snippet formatter({ item, name, value })}
								<div
									style="--color-bg: {item.color}; --color-border: {item.color};"
									class="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 items-center justify-between leading-none">
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<span class="font-mono font-medium text-foreground tabular-nums">
										{Number(value).toFixed(1)}%
									</span>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
					{#snippet marks({ context })}
						{#each context.series.visibleSeries as s (s.key)}
							<LinearGradient
								stops={[s.color ?? '', 'color-mix(in lch, ' + s.color + ' 10%, transparent)']}
								vertical
							>
								{#snippet children({ gradient })}
									<Area seriesKey={s.key} {...areaProps} fill={gradient} />
								{/snippet}
							</LinearGradient>
						{/each}
					{/snippet}
				</AreaChart>
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>

<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import FilterIcon from '@lucide/svelte/icons/filter';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient, LineChart } from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount, untrack } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatChartTimeRange, formatChartXAxisDate, getChartXAxisTicks } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		computeStep,
		type DataPoint,
		fetchCombinedFlattenedRange,
		fetchFlattenedRange,
		generateChartConfig,
		getSeries
	} from '$lib/prometheus';
	import { cn } from '$lib/utils';

	// Canonical node-detail time-series area chart. One shared shell keeps every
	// chart's reload loop, header, tooltip and gradient identical; callers vary only
	// the query, the value formatter and a few display flags.
	let {
		client,
		title,
		description,
		tooltip,
		buildQuery,
		format,
		colors,
		variant = 'area',
		stacked = false,
		highlightTop3 = false,
		filterMode = 'none',
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		title: string;
		description: string;
		tooltip: string;
		// Returns one query (single series) or a Record of named queries (multi series).
		// `topk` is only meaningful when filterMode === 'server'.
		buildQuery: (topk: number) => string | Record<string, string>;
		format: (value: number) => string;
		// Optional explicit colors keyed by series name, to override the order-based palette
		// (e.g. semantic colouring of Usage / Request / Limit).
		colors?: Record<string, string>;
		// 'line' for reference-level / closely-tracking series (commitment, load average);
		// 'area' (default) for volume-style series.
		variant?: 'area' | 'line';
		stacked?: boolean;
		highlightTop3?: boolean;
		// 'server' = topk is baked into the query and changing it refetches.
		// 'client' = fetch everything, keep only the top-k series locally.
		filterMode?: 'none' | 'client' | 'server';
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	const effectiveEnd = $derived(endIsNow ? new Date() : end);
	const timeRangeHours = $derived((effectiveEnd.getTime() - start.getTime()) / 3_600_000);
	const chartTimeRange = $derived(formatChartTimeRange(timeRangeHours));

	let topk = $state(10);
	let rawData = $state<DataPoint[]>([]);
	let isLoaded = $state(false);
	let hasError = $state(false);

	async function fetch(topkValue: number = topk) {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs, 60);
			const q = buildQuery(topkValue);
			rawData =
				typeof q === 'string'
					? await fetchFlattenedRange(client, q, new Date(startMs), new Date(endMs), step)
					: await fetchCombinedFlattenedRange(client, q, new Date(startMs), new Date(endMs), step);
			hasError = false;
		} catch {
			hasError = true;
		}
	}

	function topKSeriesKeys(data: DataPoint[], k: number): string[] {
		const config = generateChartConfig(data);
		return Object.keys(config)
			.map((key) => ({ key, total: data.reduce((s, d) => s + (Number(d[key]) || 0), 0) }))
			.sort((a, b) => b.total - a.total)
			.slice(0, k)
			.map((i) => i.key);
	}

	const displayData = $derived.by(() => {
		if (filterMode !== 'client') return rawData;
		const keys = topKSeriesKeys(rawData, topk);
		return rawData.map((datum) => {
			const filtered: DataPoint = { date: datum.date };
			keys.forEach((key) => {
				const val = datum[key];
				filtered[key] = typeof val === 'number' ? Math.max(0, val) : val;
			});
			return filtered;
		});
	});
	const chartConfig = $derived.by(() => {
		const cfg = generateChartConfig(displayData);
		if (colors) {
			for (const key of Object.keys(cfg)) {
				if (colors[key]) cfg[key] = { label: cfg[key].label, color: colors[key] };
			}
		}
		return cfg;
	});
	const series = $derived(getSeries(chartConfig));

	const areaProps = {
		curve: curveMonotoneX,
		'fill-opacity': 0.4,
		line: { class: 'stroke-1' },
		motion: 'tween'
	} as const;

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	// Server-side top-k: refetch whenever the filter changes (also drives the first load).
	$effect(() => {
		if (filterMode !== 'server') return;
		const t = topk;
		untrack(() => fetch(t).then(() => (isLoaded = true)));
	});

	onMount(async () => {
		if (filterMode !== 'server') {
			await fetch();
			isLoaded = true;
		}
	});
	onDestroy(() => reloadManager.stop());
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">{title}</Statistics.Title>
			<p class="text-sm text-muted-foreground">{description}</p>
		</div>
		{#if filterMode !== 'none'}
			<div class="relative">
				<span class="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground">
					<FilterIcon class="size-4" />
				</span>
				<Input type="number" bind:value={topk} min={0} step={5} class="h-8 w-20 pl-8" />
			</div>
		{/if}
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{tooltip}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>

	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin text-muted-foreground/50" />
			</div>
		{:else if hasError || displayData.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{#snippet sharedTooltip()}
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
					{#snippet formatter({ item, name, value, payload })}
						{@const isTop =
							highlightTop3 &&
							payload
								.map((d) => Number(d.value))
								.sort((p, n) => n - p)
								.slice(0, 3)
								.includes(Number(value))}
						<div
							style="--color-bg: {item.color}; --color-border: {item.color};"
							class="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
						></div>
						<div class="flex flex-1 shrink-0 items-center justify-between gap-2 leading-none">
							<span class={cn('text-muted-foreground', isTop && 'font-bold text-destructive')}>
								{name}
							</span>
							<span
								class={cn(
									'font-mono font-medium text-foreground tabular-nums',
									isTop && 'font-bold text-destructive'
								)}
							>
								{format(Number(value))}
							</span>
						</div>
					{/snippet}
				</Chart.Tooltip>
			{/snippet}

			{@const axisProps = {
				xAxis: {
					ticks: getChartXAxisTicks(chartTimeRange),
					format: (date: Date) => formatChartXAxisDate(date, chartTimeRange)
				},
				yAxis: { format: () => '' }
			}}

			<Chart.Container config={chartConfig} class="aspect-auto h-[200px] w-full">
				{#if variant === 'line'}
					<LineChart
						data={displayData}
						x="date"
						xScale={scaleUtc()}
						{series}
						props={{ spline: { motion: 'tween', class: 'stroke-2' }, ...axisProps }}
					>
						{#snippet tooltip()}{@render sharedTooltip()}{/snippet}
					</LineChart>
				{:else}
					<AreaChart
						data={displayData}
						x="date"
						xScale={scaleUtc()}
						{series}
						seriesLayout={stacked ? 'stack' : undefined}
						props={{ area: areaProps, ...axisProps }}
					>
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

						{#snippet tooltip()}{@render sharedTooltip()}{/snippet}
					</AreaChart>
				{/if}
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>

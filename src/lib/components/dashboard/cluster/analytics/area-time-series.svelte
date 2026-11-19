<script lang="ts">
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import FilterIcon from '@lucide/svelte/icons/filter';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient, LineChart } from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { inputVariants } from '$lib/components/shadcnio/input';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
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

	import { chartFrameClass } from './chart';
	import ChartTooltip from './chart-tooltip.svelte';

	// Canonical node-detail time-series chart. One shared shell keeps every chart's reload loop,
	// header, axes, tooltip and gradient identical; callers vary only the query, the value
	// formatter and a few display flags.
	let {
		client,
		title,
		description,
		tooltip,
		buildQuery,
		format,
		axisFormat,
		colors,
		dashed,
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
		// Shorter form of `format` for the Y axis ticks. Defaults to `format`.
		axisFormat?: (value: number) => string;
		// Optional explicit colours keyed by series name, to override the order-based palette.
		// Chart tokens only (`var(--chart-1)` … `var(--chart-5)`): they are one blue ramp, so
		// series differ by lightness, and `--chart-1` is the one furthest from the card in both
		// themes.
		colors?: Record<string, string>;
		// Series drawn with a dashed line, so a reference level reads apart from a measurement
		// without relying on colour.
		dashed?: string[];
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

	const points = useLoadable<DataPoint[]>(
		async () => {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs, 60);
			const q = buildQuery(topk);
			const data =
				typeof q === 'string'
					? await fetchFlattenedRange(client, q, new Date(startMs), new Date(endMs), step)
					: await fetchCombinedFlattenedRange(client, q, new Date(startMs), new Date(endMs), step);
			return data.length > 0 ? data : null;
		},
		() => isReloading ?? false
	);

	// Server-side top-k: refetch whenever the filter changes. The first load is the loadable's.
	let topkSeen = false;
	$effect(() => {
		if (filterMode !== 'server') return;
		void topk;
		if (!topkSeen) {
			topkSeen = true;
			return;
		}
		untrack(() => void points.refresh());
	});

	function topKSeriesKeys(data: DataPoint[], k: number): string[] {
		const config = generateChartConfig(data);
		return Object.keys(config)
			.map((key) => ({ key, total: data.reduce((s, d) => s + (Number(d[key]) || 0), 0) }))
			.sort((a, b) => b.total - a.total)
			.slice(0, k)
			.map((i) => i.key);
	}

	const rawData = $derived(points.data ?? []);
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

	// Whether the chart names its series. Known before the first answer, so the skeleton
	// already leaves room for the legend.
	const named = $derived(typeof buildQuery(topk) !== 'string');
	const showLegend = $derived(points.status === 'ready' ? series.length > 1 : named);

	const DASH = '[stroke-dasharray:5_4]';
	const isDashed = (key: string) => dashed?.includes(key) ?? false;

	const areaProps = { curve: curveMonotoneX, motion: 'tween' } as const;
	const lineClass = (key: string) => cn('stroke-[1.5]', isDashed(key) && DASH);

	const padding = { left: 52, bottom: 24, top: 8, right: 12 };
	const axisProps = $derived({
		xAxis: {
			ticks: getChartXAxisTicks(chartTimeRange),
			format: (date: Date) => formatChartXAxisDate(date, chartTimeRange)
		},
		yAxis: { ticks: 3, format: (value: number) => (axisFormat ?? format)(value) },
		grid: { x: false, y: true }
	});
</script>

<WidgetCard
	{title}
	{description}
	info={tooltip}
	status={points.status}
	stale={points.stale}
	emptyIcon={ChartLineIcon}
	bodyClass={showLegend ? 'min-h-[232px]' : 'min-h-[200px]'}
>
	{#snippet action()}
		{#if filterMode !== 'none'}
			<label class="relative block">
				<span class="sr-only">{m.cla_top_series()}</span>
				<span
					class="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
					aria-hidden="true"
				>
					<FilterIcon class="size-3.5" />
				</span>
				<input
					type="number"
					bind:value={topk}
					min={0}
					step={5}
					class={cn(inputVariants({ size: 'sm' }), 'w-20 pl-8 font-mono tabular-nums')}
				/>
			</label>
		{/if}
	{/snippet}

	{#snippet skeleton()}
		<div class="flex flex-col gap-3" aria-hidden="true">
			<Skeleton class="h-[200px] w-full" />
			{#if showLegend}
				<Skeleton class="h-5 w-48" />
			{/if}
		</div>
	{/snippet}

	<div class="flex min-w-0 flex-col gap-3">
		<div class={cn(chartFrameClass, 'h-[200px]')}>
			{#if variant === 'line'}
				<LineChart
					data={displayData}
					x="date"
					xScale={scaleUtc()}
					series={series.map((s) => ({ ...s, props: { class: lineClass(s.key) } }))}
					{padding}
					props={{ spline: { motion: 'tween', curve: curveMonotoneX }, ...axisProps }}
				>
					{#snippet tooltip()}<ChartTooltip {format} {highlightTop3} />{/snippet}
				</LineChart>
			{:else}
				<AreaChart
					data={displayData}
					x="date"
					xScale={scaleUtc()}
					{series}
					seriesLayout={stacked ? 'stack' : 'overlap'}
					{padding}
					props={{ area: areaProps, ...axisProps }}
				>
					{#snippet marks({ context })}
						{#each context.series.visibleSeries as s (s.key)}
							<LinearGradient
								stops={[
									'color-mix(in oklab, ' + s.color + ' 25%, transparent)',
									'color-mix(in oklab, ' + s.color + ' 0%, transparent)'
								]}
								vertical
							>
								{#snippet children({ gradient })}
									<Area
										seriesKey={s.key}
										{...areaProps}
										fill={gradient}
										line={{ class: lineClass(s.key) }}
									/>
								{/snippet}
							</LinearGradient>
						{/each}
					{/snippet}

					{#snippet tooltip()}<ChartTooltip {format} {highlightTop3} />{/snippet}
				</AreaChart>
			{/if}
		</div>
		{#if showLegend}
			<!-- The series are one blue ramp: the legend names each one beside its colour key, and a
			     dashed series is drawn dashed here too. -->
			<ul
				class="flex max-h-10 min-h-5 flex-wrap items-center gap-x-4 gap-y-1 overflow-y-auto text-xs text-muted-foreground"
			>
				{#each series as s (s.key)}
					<li class="flex min-w-0 items-center gap-1.5">
						<svg class="h-2 w-4 shrink-0" viewBox="0 0 16 8" aria-hidden="true">
							<line
								x1="0"
								y1="4"
								x2="16"
								y2="4"
								stroke={s.color}
								stroke-width="2.5"
								stroke-linecap={isDashed(s.key) ? 'butt' : 'round'}
								stroke-dasharray={isDashed(s.key) ? '5 3' : undefined}
							/>
						</svg>
						<span class="truncate">{s.key}</span>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</WidgetCard>

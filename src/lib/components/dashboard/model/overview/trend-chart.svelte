<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, Rule } from 'layerchart';

	import { Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	import { niceTop } from './lib/models';
	import type { TrendLine, TrendRow } from './lib/trend';

	// One line per model on a single y axis: three y ticks, five time ticks, the legend below in
	// the models' names. A threshold, when given, is a dashed rule that stays out of the legend.
	let {
		title,
		note,
		data,
		series,
		format,
		state,
		yMax,
		threshold,
		height = 180
	}: {
		title: string;
		/** Right of the title, e.g. "Busiest pod of each model". */
		note?: string;
		data: TrendRow[];
		series: TrendLine[];
		format: (value: number) => string;
		state: WidgetState;
		/** A fixed top for the y axis, e.g. 100 for percentages. */
		yMax?: number;
		threshold?: number;
		height?: number;
	} = $props();

	const config = $derived(
		Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
	);
	const top = $derived.by(() => {
		if (yMax !== undefined) return yMax;
		let max = 0;
		for (const d of data) {
			for (const s of series) {
				const v = d[s.key];
				if (typeof v === 'number' && Number.isFinite(v)) max = Math.max(max, v);
			}
		}
		return niceTop(max);
	});
	const yTicks = $derived([0, top / 2, top]);
	const span = $derived(
		data.length > 1 ? data[data.length - 1].date.getTime() - data[0].date.getTime() : 0
	);
	const xFormat = (d: Date) =>
		span > 36 * 3600 * 1000
			? d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
			: d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
	const areaProps = { curve: curveMonotoneX, motion: 'none' } as const;
</script>

<!-- Every state keeps the plot's height and the legend's line, so nothing moves when data lands. -->
<Panel {title} bodyClass="pt-2">
	{#snippet actions()}
		{#if note}
			<span class="mt-1.5 mr-1 text-xs whitespace-nowrap text-muted-foreground">{note}</span>
		{/if}
	{/snippet}
	<div style:height="{height}px">
		{#if state === 'loading' || (state === 'ready' && data.length === 0)}
			<Skeleton class="h-full w-full rounded-lg" />
		{:else if state === 'empty' || state === 'error'}
			<div
				class="flex h-full flex-col items-start justify-center gap-1 text-muted-foreground"
				role="status"
			>
				<span class="text-[1.75rem] leading-8" aria-hidden="true">—</span>
				<span class="text-xs leading-4">
					{state === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
				</span>
			</div>
		{:else}
			<Chart.Container
				{config}
				class="aspect-auto h-full w-full [&_.lc-axis-tick-label]:fill-muted-foreground [&_.lc-grid-y-line]:stroke-border [&_.lc-text]:text-[11px]"
			>
				<AreaChart
					{data}
					x="date"
					xScale={scaleUtc()}
					yDomain={[0, top]}
					seriesLayout="overlap"
					padding={{ top: 6, right: 6, bottom: 22, left: 48 }}
					series={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
					props={{
						area: areaProps,
						xAxis: { ticks: 5, format: xFormat },
						yAxis: { ticks: yTicks, format },
						grid: { yTicks }
					}}
				>
					{#snippet marks()}
						{#if threshold !== undefined}
							<!-- The container's rule style beats a stroke attribute, so the colour goes in a class. -->
							<Rule
								y={threshold}
								class="stroke-destructive! [stroke-width:1]! [stroke-dasharray:4_4]!"
							/>
						{/if}
						{#each series as s (s.key)}
							<Area
								seriesKey={s.key}
								{...areaProps}
								fill="transparent"
								line={{ stroke: s.color, 'stroke-width': 1.5 }}
							/>
						{/each}
					{/snippet}
					{#snippet tooltip()}
						<Chart.Tooltip
							indicator="line"
							labelFormatter={(v: Date) => v.toLocaleString(getLocale(), { hour12: false })}
						>
							{#snippet formatter({ item, name, value })}
								<span class="size-2.5 shrink-0 rounded-[2px]" style:background={item.color}></span>
								<span class="flex flex-1 items-center justify-between gap-3 leading-none">
									<span class="font-mono text-muted-foreground">{name}</span>
									<span class="font-medium text-foreground tabular-nums"
										>{format(Number(value))}</span
									>
								</span>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</AreaChart>
			</Chart.Container>
		{/if}
	</div>
	<ul
		class="mt-3 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
	>
		{#each state === 'ready' ? series : [] as s (s.key)}
			<li class="flex min-w-0 items-center gap-1.5">
				<span class="w-4 shrink-0 border-t-2" style:border-color={s.color} aria-hidden="true"
				></span>
				<span class="truncate font-mono">{s.label}</span>
			</li>
		{/each}
	</ul>
</Panel>

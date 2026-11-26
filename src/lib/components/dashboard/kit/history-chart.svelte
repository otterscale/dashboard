<script lang="ts" module>
	export type LineStyle = 'area' | 'line' | 'dashed' | 'dotted';
	export type ChartSeries = {
		key: string;
		label: string;
		style: LineStyle;
		color?: string;
		/** Stroke width; 1.5 for `area`, 1 otherwise when left out. */
		width?: number;
		/** Leave out of the legend, e.g. a reference level the title already names. */
		hideLegend?: boolean;
	};
	export type ChartPoint = { date: Date } & Record<string, number | Date>;
</script>

<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, Circle, LinearGradient } from 'layerchart';

	import { Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton';

	// History line chart: one y axis, three y ticks, five time ticks, the newest point marked.
	// Usage is a line over a faint wash; request a thin line, limit dashed, allocatable dotted.
	let {
		title,
		subtitle,
		peak,
		data,
		series,
		format,
		state,
		height = 200,
		yMax,
		evenTicks = false
	}: {
		title: string;
		/** Under the title, e.g. the window: "Last 7 days". */
		subtitle?: string;
		/** Right of the title, e.g. "Peak usage 17% · request 87%". */
		peak?: string;
		data: ChartPoint[];
		series: ChartSeries[];
		format: (value: number) => string;
		state: WidgetState;
		height?: number;
		/** A floor for the top of the y axis, e.g. 100 for percentages. */
		yMax?: number;
		/** Exactly five time ticks, evenly spaced from the first point to the last, for a narrow card. */
		evenTicks?: boolean;
	} = $props();

	const colored = $derived(series.map((s) => ({ ...s, color: s.color ?? 'var(--chart-3)' })));
	const config = $derived(
		Object.fromEntries(colored.map((s) => [s.key, { label: s.label, color: s.color }]))
	);
	const top = $derived.by(() => {
		let max = yMax ?? 0;
		for (const d of data) {
			for (const s of series) {
				const v = d[s.key];
				if (typeof v === 'number' && Number.isFinite(v)) max = Math.max(max, v);
			}
		}
		return max > 0 ? max * 1.08 : 1;
	});
	const last = $derived(data.length > 0 ? data[data.length - 1] : undefined);
	const lead = $derived(colored.find((s) => s.style === 'area') ?? colored[0]);

	const dash: Record<LineStyle, string | undefined> = {
		area: undefined,
		line: undefined,
		dashed: '4 3',
		dotted: '1 3'
	};
	const timeFormat = (d: Date) =>
		d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
	const span = $derived(
		data.length > 1
			? (data[data.length - 1].date as Date).getTime() - (data[0].date as Date).getTime()
			: 0
	);
	const xFormat = (d: Date) =>
		span > 36 * 3600 * 1000
			? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
			: timeFormat(d);
	const xTicks = $derived.by(() => {
		if (!evenTicks || data.length < 2) return 5;
		const first = (data[0].date as Date).getTime();
		return Array.from({ length: 5 }, (_, i) => new Date(first + (span * i) / 4));
	});
	const areaProps = { curve: curveMonotoneX, motion: 'none' } as const;
</script>

<Panel
	{title}
	description={subtitle}
	showDescription={subtitle !== undefined}
	{state}
	class="min-h-[18rem]"
	bodyClass="pt-2"
>
	{#snippet actions()}
		{#if peak && state === 'ready'}
			<span class="mt-1.5 mr-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
				>{peak}</span
			>
		{/if}
	{/snippet}
	<div style:height="{height}px">
		{#if data.length === 0}
			<Skeleton class="h-full w-full rounded-lg" />
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
					padding={{ top: 6, right: 6, bottom: 22, left: 64 }}
					series={colored.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
					props={{
						area: areaProps,
						xAxis: { ticks: xTicks, format: xFormat },
						yAxis: { ticks: 3, format },
						grid: { yTicks: 3 }
					}}
				>
					{#snippet marks({ context })}
						{#each colored as s (s.key)}
							{@const line = {
								stroke: s.color,
								'stroke-width': s.width ?? (s.style === 'area' ? 1.5 : 1),
								'stroke-dasharray': dash[s.style]
							}}
							{#if s.style === 'area'}
								<LinearGradient
									stops={[
										`color-mix(in oklab, ${s.color} 14%, transparent)`,
										`color-mix(in oklab, ${s.color} 2%, transparent)`
									]}
									vertical
								>
									{#snippet children({ gradient })}
										<Area seriesKey={s.key} {...areaProps} fill={gradient} {line} />
									{/snippet}
								</LinearGradient>
							{:else}
								<Area seriesKey={s.key} {...areaProps} fill="transparent" {line} />
							{/if}
						{/each}
						{#if last && lead && typeof last[lead.key] === 'number'}
							<Circle
								cx={context.xScale(last.date)}
								cy={context.yScale(last[lead.key])}
								r={3}
								fill={lead.color}
							/>
						{/if}
					{/snippet}
					{#snippet tooltip()}
						<Chart.Tooltip
							indicator="line"
							labelFormatter={(v: Date) => v.toLocaleString([], { hour12: false })}
						>
							{#snippet formatter({ item, name, value })}
								<span class="size-2.5 shrink-0 rounded-[2px]" style:background={item.color}></span>
								<span class="flex flex-1 items-center justify-between gap-3 leading-none">
									<span class="text-muted-foreground">{name}</span>
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
		{#each colored.filter((s) => !s.hideLegend) as s (s.key)}
			<li class="flex items-center gap-1.5">
				<span
					class={[
						'w-4 border-t-2',
						{ 'border-dashed': s.style === 'dashed', 'border-dotted': s.style === 'dotted' }
					]}
					style:border-color={s.color}
					aria-hidden="true"
				></span>
				{s.label}
			</li>
		{/each}
	</ul>
</Panel>

<script lang="ts">
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart } from 'layerchart';

	import { Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import type { DataPoint } from '$lib/prometheus';

	import { niceTop } from './format';

	// Read and write on one chart: read a 2px ink line, write a thinner blue one. One y axis with
	// three ticks, five time ticks, and the latest value of each in the corner.
	let {
		title,
		description,
		data,
		readKey,
		writeKey,
		format,
		state
	}: {
		title: string;
		/** A line under the title, e.g. which statistic the numbers are. */
		description?: string;
		data: DataPoint[];
		readKey: string;
		writeKey: string;
		format: (value: number) => string;
		state: WidgetState;
	} = $props();

	const READ = 'var(--chart-3)';
	const WRITE = 'var(--chart-6)';

	const series = $derived([
		{ key: readKey, label: m.read(), color: READ, width: 2 },
		{ key: writeKey, label: m.write(), color: WRITE, width: 1.5 }
	]);
	const config = $derived(
		Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
	);

	function latest(key: string): number | undefined {
		for (let i = data.length - 1; i >= 0; i--) {
			const v = data[i][key];
			if (typeof v === 'number' && Number.isFinite(v)) return v;
		}
		return undefined;
	}
	const now = $derived(
		m.storage_now_read_write({
			read: format(latest(readKey) ?? 0),
			write: format(latest(writeKey) ?? 0)
		})
	);
	// Exactly three y ticks: 0, half, and a round top just above the highest point.
	const top = $derived.by(() => {
		let max = 0;
		for (const d of data) {
			for (const key of [readKey, writeKey]) {
				const v = d[key];
				if (typeof v === 'number' && Number.isFinite(v)) max = Math.max(max, v);
			}
		}
		return niceTop(max);
	});
	const yTicks = $derived([0, top / 2, top]);
	const span = $derived(
		data.length > 1
			? (data[data.length - 1].date as Date).getTime() - (data[0].date as Date).getTime()
			: 0
	);
	const xFormat = (d: Date) =>
		span > 36 * 3600 * 1000
			? d.toLocaleDateString([], { month: 'short', day: 'numeric' })
			: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
	const areaProps = { curve: curveMonotoneX, motion: 'none' } as const;
</script>

<Panel
	{title}
	{description}
	showDescription={description !== undefined}
	state={state === 'loading' ? 'ready' : state}
	class="min-h-[18.5rem]"
	bodyClass="pt-2"
>
	{#snippet actions()}
		{#if state === 'ready'}
			<span class="mt-1.5 mr-1 text-xs whitespace-nowrap text-muted-foreground tabular-nums"
				>{now}</span
			>
		{/if}
	{/snippet}
	<div class="h-[180px]">
		{#if state === 'loading' || data.length === 0}
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
					padding={{ top: 6, right: 6, bottom: 26, left: 64 }}
					series={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
					props={{
						area: areaProps,
						// The time labels sit clear of the y axis's 0, which shares their corner.
						xAxis: { ticks: 5, format: xFormat, tickLength: 10, tickMarks: false },
						yAxis: { ticks: yTicks, format },
						grid: { yTicks }
					}}
				>
					{#snippet marks()}
						{#each series as s (s.key)}
							<Area
								seriesKey={s.key}
								{...areaProps}
								fill="transparent"
								line={{ stroke: s.color, 'stroke-width': s.width }}
							/>
						{/each}
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
		{#each series as s (s.key)}
			<li class="flex items-center gap-1.5">
				<span class="w-4 border-t-2" style:border-color={s.color} aria-hidden="true"></span>
				{s.label}
			</li>
		{/each}
	</ul>
</Panel>

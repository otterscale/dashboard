<script lang="ts" module>
	export type BarSeries = { key: string; label: string; color: string };
	/** `date` is where the bucket starts, `end` where it ends (the last one may be short). */
	export type BarPoint = { date: Date; end: Date } & Record<string, number | Date>;

	/** The lighter of the two stacked parts: muted text mixed into the card. */
	export const SOFT_FILL = 'color-mix(in oklab, var(--muted-foreground) 55%, var(--card))';
</script>

<script lang="ts">
	import { BarChart } from 'layerchart';

	import { Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { getLocale } from '$lib/paraglide/runtime';

	import { niceTop } from './lib/format';

	// Bars per time bucket, two series stacked: one y axis with three ticks (top, half, zero),
	// five time ticks, the bucket's numbers on hover.
	let {
		title,
		tooltip,
		data,
		series,
		format,
		state,
		bucketSeconds,
		height = 200
	}: {
		title: string;
		/** Behind the ⓘ beside the title. */
		tooltip?: string;
		data: BarPoint[];
		/** Bottom first; one series draws plain bars. */
		series: [BarSeries, BarSeries] | [BarSeries];
		format: (value: number) => string;
		state: WidgetState;
		bucketSeconds: number;
		height?: number;
	} = $props();

	const config = $derived(
		Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
	);
	const top = $derived.by(() => {
		let max = 0;
		for (const d of data) {
			let sum = 0;
			for (const s of series) sum += Number(d[s.key]) || 0;
			max = Math.max(max, sum);
		}
		return niceTop(max);
	});
	const yTicks = $derived(top > 0 ? [0, top / 2, top] : [0]);
	const xTicks = $derived.by(() => {
		const n = data.length;
		// Few bars (a week of days): label each, rather than five unevenly spaced ones.
		if (n <= 8) return data.map((d) => d.date);
		return Array.from({ length: 5 }, (_, i) => data[Math.round((i * (n - 1)) / 4)].date);
	});

	const daily = $derived(bucketSeconds >= 86_400);
	const xFormat = (d: Date) =>
		daily
			? d.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' })
			: d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
	// A bar is labelled by its bucket's start; the tooltip names the whole bucket.
	const bucketLabel = (d: Date) => {
		const from = new Date(d.getTime());
		const to =
			data.find((p) => p.date.getTime() === from.getTime())?.end ??
			new Date(from.getTime() + bucketSeconds * 1000);
		if (daily) return from.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
		const day = from.toLocaleDateString(getLocale(), { month: 'short', day: 'numeric' });
		return `${day} ${xFormat(from)}–${xFormat(to)}`;
	};
</script>

<!-- While loading, the plot area itself is the placeholder, so the card keeps its shape. -->
<Panel
	{title}
	{tooltip}
	state={state === 'loading' ? 'ready' : state}
	class="min-h-[18rem]"
	bodyClass="pt-2"
>
	{#snippet actions()}
		<span class="mt-1.5 mr-1 flex items-center gap-3 text-xs text-muted-foreground">
			{#each series as s (s.key)}
				<span class="flex items-center gap-1.5">
					<span class="size-2 rounded-[2px]" style:background={s.color}></span>{s.label}
				</span>
			{/each}
		</span>
	{/snippet}
	<div style:height="{height}px">
		{#if state === 'loading' || data.length === 0}
			<Skeleton class="h-full w-full rounded-lg" />
		{:else}
			<Chart.Container
				{config}
				class="aspect-auto h-full w-full [&_.lc-axis-tick-label]:fill-muted-foreground [&_.lc-grid-y-line]:stroke-border [&_.lc-text]:text-[11px]"
			>
				<BarChart
					{data}
					x="date"
					seriesLayout="stack"
					bandPadding={0.18}
					yDomain={[0, top || 1]}
					padding={{ top: 6, right: 4, bottom: 22, left: 52 }}
					series={series.map((s) => ({ key: s.key, label: s.label, color: s.color }))}
					props={{
						// A card-coloured outline leaves a 2px seam between the two stacked parts.
						bars: { stroke: 'var(--card)', strokeWidth: 1, rounded: 'none', motion: 'none' },
						highlight: { area: { class: 'fill-muted' } },
						xAxis: { ticks: xTicks, format: xFormat },
						yAxis: { ticks: yTicks, format },
						grid: { x: false, yTicks }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip labelFormatter={(d: Date) => bucketLabel(d)}>
							{#snippet formatter({ item, name, value })}
								<div
									class="size-2.5 shrink-0 rounded-[2px]"
									style:background={item.color}
									aria-hidden="true"
								></div>
								<div class="flex flex-1 items-center justify-between gap-4 leading-none">
									<span class="text-muted-foreground">{name}</span>
									<span class="font-mono font-medium text-foreground tabular-nums">
										{format(Number(value))}
									</span>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</BarChart>
			</Chart.Container>
		{/if}
	</div>
</Panel>

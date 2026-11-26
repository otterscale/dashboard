<script lang="ts">
	import { BarChart } from 'layerchart';

	import { Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	import { niceTop } from '../../overview/lib/models';
	import { FINISH } from '../lib/chart-style';
	import { type FinishPoint, fmtDecimal as fmt, isLongSpan } from '../lib/history';

	// Finished requests per bucket, stacked: Stop, Length limit, Aborted.
	let {
		data,
		state,
		bucket,
		height = 180
	}: {
		data: FinishPoint[];
		state: WidgetState;
		/** The bucket's length, e.g. "5 min". */
		bucket: string;
		height?: number;
	} = $props();

	const series = $derived([
		{ key: 'stop', label: m.model_analytics_finish_stop(), color: FINISH.stop },
		{ key: 'length', label: m.model_analytics_finish_length(), color: FINISH.length },
		{ key: 'aborted', label: m.model_analytics_finish_aborted(), color: FINISH.aborted }
	]);
	const config = $derived(
		Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: s.color }]))
	);
	const top = $derived(niceTop(Math.max(0, ...data.map((d) => d.stop + d.length + d.aborted))));
	const yTicks = $derived([0, top / 2, top]);
	const xTicks = $derived.by(() => {
		const n = data.length;
		if (n <= 5) return data.map((d) => d.date);
		return Array.from({ length: 5 }, (_, i) => data[Math.round((i * (n - 1)) / 4)].date);
	});
	const long = $derived(
		data.length > 1 && isLongSpan(data[data.length - 1].end.getTime() - data[0].date.getTime())
	);
	const time = (d: Date) =>
		long
			? d.toLocaleString(getLocale(), {
					month: 'short',
					day: 'numeric',
					hour: '2-digit',
					hour12: false
				})
			: d.toLocaleTimeString(getLocale(), { hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<Panel title={m.model_analytics_finish_reason()} {state} class="min-h-[18rem]" bodyClass="pt-2">
	{#snippet actions()}
		{#if state === 'ready'}
			<span class="mt-1.5 mr-1 text-xs whitespace-nowrap text-muted-foreground">
				{m.model_analytics_requests_per({ bucket })}
			</span>
		{/if}
	{/snippet}
	<div style:height="{height}px">
		{#if data.length === 0}
			<Skeleton class="size-full rounded-lg" />
		{:else}
			<Chart.Container
				{config}
				class="aspect-auto size-full [&_.lc-axis-tick-label]:fill-muted-foreground [&_.lc-grid-y-line]:stroke-border [&_.lc-text]:text-[11px]"
			>
				<BarChart
					{data}
					x="date"
					seriesLayout="stack"
					bandPadding={0.2}
					yDomain={[0, top]}
					padding={{ top: 6, right: 4, bottom: 22, left: 40 }}
					{series}
					props={{
						bars: { stroke: 'var(--card)', strokeWidth: 1, rounded: 'none', motion: 'none' },
						highlight: { area: { class: 'fill-muted' } },
						xAxis: { ticks: xTicks, format: time },
						yAxis: { ticks: yTicks, format: fmt },
						grid: { x: false, yTicks }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip
							labelFormatter={(d: Date) => {
								const p = data.find((x) => x.date.getTime() === d.getTime());
								return p ? `${time(p.date)}–${time(p.end)}` : time(d);
							}}
						>
							{#snippet formatter({ item, name, value })}
								<span class="size-2.5 shrink-0 rounded-[2px]" style:background={item.color}></span>
								<span class="flex flex-1 items-center justify-between gap-4 leading-none">
									<span class="text-muted-foreground">{name}</span>
									<span class="font-medium text-foreground tabular-nums">{fmt(Number(value))}</span>
								</span>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</BarChart>
			</Chart.Container>
		{/if}
	</div>
	<ul
		class="mt-3 flex min-h-5 flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground"
	>
		{#each series as s (s.key)}
			<li class="flex items-center gap-1.5">
				<span class="size-2 rounded-[2px]" style:background={s.color} aria-hidden="true"></span>
				{s.label}
			</li>
		{/each}
	</ul>
</Panel>

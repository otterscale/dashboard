<script lang="ts">
	import { ChartLine, Filter, LoaderCircle, Square } from '@lucide/svelte';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import { formatChartTimeRange, formatChartXAxisDate, getChartXAxisTicks } from '$lib/formatter';
	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import {
		type DataPoint,
		fetchFlattenedRange,
		generateChartConfig,
		getSeries
	} from '$lib/prometheus';
	import ChartContainer from '$lib/components/ui/chart/chart-container.svelte';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import Input from '$lib/components/ui/input/input.svelte';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';

	let { client, fqdn }: { client: PrometheusDriver; fqdn: string } = $props();

	// Configuration
	const STEP_SECONDS = 60;
	const TIME_RANGE_HOURS = 1;
	const TOP_HIGHLIGHT_COUNT = 3;

	// Time range (stable, computed once at mount)
	const endTime = new Date();
	const startTime = new Date(endTime.getTime() - TIME_RANGE_HOURS * 60 * 60 * 1000);

	// Prometheus query (fqdn is stable after mount via {#key} in parent)
	// Use $derived to properly track fqdn as reactive dependency per Svelte 5 rules
	const query = $derived(
		`sum by (cpu) (rate(node_cpu_seconds_total{instance=~"${fqdn}", mode!="idle"}[5m])) * 100`
	);

	// Filter state
	let topk = $state(10);

	// Fetch state
	let rawData = $state<DataPoint[]>([]);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		try {
			rawData = await fetchFlattenedRange(client, query, startTime, endTime, STEP_SECONDS);
		} catch {
			hasError = true;
		}
		isLoading = false;
	});

	// Stable derived values — only recompute when rawData or topk actually changes
	const topKSeries = $derived(calculateTopKSeries(rawData, topk));
	const filteredData = $derived(filterDataByTopK(rawData, topKSeries));
	const chartConfig = $derived(generateChartConfig(filteredData));
	const top3Series = $derived(topKSeries.slice(0, TOP_HIGHLIGHT_COUNT));
	const series = $derived(getSeries(chartConfig));

	function calculateTopKSeries(data: DataPoint[], k: number): string[] {
		const config = generateChartConfig(data);
		return Object.keys(config)
			.map((key) => ({
				key,
				total: data.reduce((sum, datum) => sum + (Number(datum[key]) || 0), 0)
			}))
			.sort((a, b) => b.total - a.total)
			.slice(0, k)
			.map((item) => item.key);
	}

	// Clamp values to ≥ 0 to prevent negative widths in stacked chart
	function filterDataByTopK(data: DataPoint[], topKSeries: string[]): DataPoint[] {
		return data.map((datum) => {
			const filtered: DataPoint = { date: datum.date };
			topKSeries.forEach((key) => {
				const val = datum[key];
				filtered[key] = typeof val === 'number' ? Math.max(0, val) : val;
			});
			return filtered;
		});
	}

	function isTopSeries(name: string, topSeries: string[]): boolean {
		return topSeries.includes(name);
	}
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header>
		<div class="flex">
			<Statistics.Title class="h-8 **:data-[slot=data-table-statistics-title-icon]:size-6">
				<div class="flex flex-col justify-between">
					{m.cpu()}
					<p class="text-sm text-muted-foreground">{m.core()}/{m.processor()}</p>
				</div>
			</Statistics.Title>
			<div class="relative ml-auto">
				<span class="absolute top-1/2 left-3 -translate-y-1/2 items-center">
					<Filter />
				</span>
				<Input type="number" bind:value={topk} min={0} step={5} class="h-8 w-22 pl-9 text-lg" />
			</div>
		</div>
	</Statistics.Header>

	<Statistics.Content class="min-h-16">
		{#if isLoading}
			<div class="flex h-[250px] w-full items-center justify-center">
				<LoaderCircle class="m-8 size-32 text-muted-foreground/50 animate-spin" />
			</div>
		{:else if hasError || filteredData.length === 0}
			<div class="flex h-[250px] w-full flex-col items-center justify-center">
				<ChartLine class="size-60 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<ChartContainer config={chartConfig} class="aspect-auto h-[250px] w-full">
				<AreaChart
					data={filteredData}
					x="date"
					xScale={scaleUtc()}
					{series}
					seriesLayout="stack"
					props={{
						area: {
							curve: curveMonotoneX,
							'fill-opacity': 0.4,
							line: { class: 'stroke-1' },
							motion: 'tween'
						},
						xAxis: {
							ticks: getChartXAxisTicks(formatChartTimeRange(TIME_RANGE_HOURS)),
							format: (date: Date) =>
								formatChartXAxisDate(date, formatChartTimeRange(TIME_RANGE_HOURS))
						},
						yAxis: {
							format: () => ''
						}
					}}
				>
					{#snippet marks({ series: chartSeries, getAreaProps })}
						<defs>
							{#each chartSeries as s (s.key)}
								{@const gradientId = s.key.replace(/\s+/g, '')}
								<linearGradient id="fill{gradientId}" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stop-color={s.color} stop-opacity={1.0} />
									<stop offset="95%" stop-color={s.color} stop-opacity={0.4} />
								</linearGradient>
							{/each}
						</defs>

						{#each chartSeries as s, index (s.key)}
							{@const gradientId = s.key.replace(/\s+/g, '')}
							<Area {...getAreaProps(s, index)} fill="url(#fill{gradientId})" />
						{/each}
					{/snippet}

					{#snippet tooltip()}
						<Chart.Tooltip
							labelFormatter={(v: Date) => {
								return v.toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'long',
									day: 'numeric',
									hour: 'numeric',
									minute: 'numeric'
								});
							}}
						>
							{#snippet formatter({ name, value })}
								{@const isTop = isTopSeries(name, top3Series)}
								<div
									class="flex w-full shrink-0 items-center justify-between gap-4 leading-none"
									style="--color-bg: var(--color-{name})"
								>
									{#if value !== undefined && value !== null}
										<span class="flex w-full items-center gap-1">
											<Square class="text-(--color-bg)" />
											<p class={isTop ? 'font-bold text-destructive' : 'text-foreground'}>
												{name}
											</p>
										</span>
										<p
											class={cn(
												'font-mono font-medium whitespace-nowrap tabular-nums',
												isTop ? 'font-bold text-destructive' : 'text-foreground'
											)}
										>
											{Number(value).toFixed(2)}%
										</p>
									{/if}
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</AreaChart>
			</ChartContainer>
		{/if}
	</Statistics.Content>
</Statistics.Root>

<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Square from '@lucide/svelte/icons/square';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/statistics/index';
	import ChartContainer from '$lib/components/ui/chart/chart-container.svelte';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatChartTimeRange, formatChartXAxisDate, getChartXAxisTicks } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import {
		type DataPoint,
		fetchFlattenedRange,
		generateChartConfig,
		getSeries
	} from '$lib/prometheus';

	let {
		client,
		fqdn,
		start,
		end,
		endIsNow
	}: { client: PrometheusDriver; fqdn: string; start: Date; end: Date; endIsNow: boolean } =
		$props();

	const effectiveEnd = $derived(endIsNow ? new Date() : end);
	const timeRangeHours = $derived((effectiveEnd.getTime() - start.getTime()) / 3_600_000);
	const chartTimeRange = $derived(formatChartTimeRange(timeRangeHours));
	const STEP_SECONDS = 60;

	let rawData = $state<DataPoint[]>([]);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		const query = `sum(rate(node_disk_io_time_seconds_total{instance=~"${fqdn}", device=~"(/dev/)?(mmcblk.p.+|nvme.+|rbd.+|sd.+|vd.+|xvd.+|dm-.+|dasd.+)"}[5m]))`;
		try {
			rawData = await fetchFlattenedRange(client, query, start, effectiveEnd, STEP_SECONDS);
		} catch {
			hasError = true;
		}
		isLoading = false;
	});

	const chartConfig = $derived(generateChartConfig(rawData));
	const series = $derived(getSeries(chartConfig));

	const areaProps = {
		curve: curveMonotoneX,
		'fill-opacity': 0.4,
		line: { class: 'stroke-1' },
		motion: 'tween'
	} as const;
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header>
		<Statistics.Title class="h-8 **:data-[slot=data-table-statistics-title-icon]:size-6">
			<div class="flex flex-col justify-between">
				{m.disk()}
				<p class="text-sm text-muted-foreground">IO {m.time()}</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if isLoading}
			<div class="flex h-[250px] w-full items-center justify-center">
				<LoaderCircle class="m-8 size-32 animate-spin text-muted-foreground/50" />
			</div>
		{:else if hasError || rawData.length === 0}
			<div class="flex h-[250px] w-full flex-col items-center justify-center">
				<ChartLine class="size-60 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_available()}</p>
			</div>
		{:else}
			<ChartContainer config={chartConfig} class="aspect-auto h-[250px] w-full">
				<AreaChart
					data={rawData}
					x="date"
					xScale={scaleUtc()}
					{series}
					props={{
						area: areaProps,
						xAxis: {
							ticks: getChartXAxisTicks(chartTimeRange),
							format: (date: Date) => formatChartXAxisDate(date, chartTimeRange)
						},
						yAxis: {
							format: () => ''
						}
					}}
				>
					{#snippet marks({ context })}
						<defs>
							{#each context.series.visibleSeries as series (series.key)}
								{@const key = series.key.replace(/\s+/g, '')}
								<linearGradient id="diskio_fill{key}" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stop-color={series.color} stop-opacity={1.0} />
									<stop offset="95%" stop-color={series.color} stop-opacity={0.4} />
								</linearGradient>
							{/each}
						</defs>

						{#each context.series.visibleSeries as series (series.key)}
							{@const key = series.key.replace(/\s+/g, '')}
							<Area seriesKey={series.key} {...areaProps} fill="url(#diskio_fill{key})" />
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
								<div
									class="flex w-full shrink-0 items-center justify-between gap-4 leading-none"
									style="--color-bg: var(--color-{name})"
								>
									{#if value !== undefined && value !== null}
										<span class="flex w-full items-center gap-1">
											<Square class="text-(--color-bg)" />
											<p class="text-foreground">
												{name}
											</p>
										</span>
										<p class="font-mono font-medium whitespace-nowrap text-foreground tabular-nums">
											{value.toLocaleString()}
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

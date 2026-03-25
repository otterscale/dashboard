<script lang="ts">
	import Icon from '@iconify/svelte';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import { formatChartTimeRange, formatChartXAxisDate, getChartXAxisTicks } from '$lib/formatter';
	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import {
		type DataPoint,
		fetchMultipleFlattenedRange,
		generateChartConfig,
		getSeries
	} from '$lib/prometheus';
	import ChartContainer from '$lib/components/ui/chart/chart-container.svelte';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { m } from '$lib/paraglide/messages';

	let { client, fqdn }: { client: PrometheusDriver; fqdn: string } = $props();

	const STEP_SECONDS = 60;
	const TIME_RANGE_HOURS = 1;

	const endTime = new Date();
	const startTime = new Date(endTime.getTime() - TIME_RANGE_HOURS * 60 * 60 * 1000);

	let rawData = $state<DataPoint[]>([]);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		const query = {
			'1m': `avg(node_load1{instance=~"${fqdn}"}) / on() group_left() avg(count by (instance) (node_cpu_seconds_total{instance=~"${fqdn}", mode="idle"})) * 100`,
			'5m': `avg(node_load5{instance=~"${fqdn}"}) / on() group_left() avg(count by (instance) (node_cpu_seconds_total{instance=~"${fqdn}", mode="idle"})) * 100`,
			'15m': `avg(node_load15{instance=~"${fqdn}"}) / on() group_left() avg(count by (instance) (node_cpu_seconds_total{instance=~"${fqdn}", mode="idle"})) * 100`
		};
		try {
			rawData = await fetchMultipleFlattenedRange(client, query, startTime, endTime, STEP_SECONDS);
		} catch {
			hasError = true;
		}
		isLoading = false;
	});

	const chartConfig = $derived(generateChartConfig(rawData));
	const series = $derived(getSeries(chartConfig));
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header>
		<Statistics.Title class="h-8 **:data-[slot=data-table-statistics-title-icon]:size-6">
			<div class="flex flex-col justify-between">
				{m.cpu()}
				<p class="text-sm text-muted-foreground">{m.load_average()}</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if isLoading}
			<div class="flex h-[250px] w-full items-center justify-center">
				<Icon icon="svg-spinners:blocks-wave" class="m-8 size-32 text-muted-foreground/50" />
			</div>
		{:else if hasError || rawData.length === 0}
			<div class="flex h-[250px] w-full flex-col items-center justify-center">
				<Icon icon="ph:chart-line-fill" class="size-60 animate-pulse text-muted-foreground" />
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
							{#each chartSeries as series (series.key)}
								{@const key = series.key.replace(/\s+/g, '')}
								<linearGradient id="fill{key}" x1="0" y1="0" x2="0" y2="1">
									<stop offset="5%" stop-color={series.color} stop-opacity={1.0} />
									<stop offset="95%" stop-color={series.color} stop-opacity={0.4} />
								</linearGradient>
							{/each}
						</defs>

						{#each chartSeries as series, index (series.key)}
							{@const key = series.key.replace(/\s+/g, '')}
							<Area {...getAreaProps(series, index)} fill="url(#fill{key})" />
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
											<Icon icon="ph:square-fill" class="text-(--color-bg)" />
											<p class="text-foreground">
												{name}
											</p>
										</span>
										<p class="font-mono font-medium whitespace-nowrap text-foreground tabular-nums">
											{value.toLocaleString()}%
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

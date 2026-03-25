<script lang="ts">
	import Icon from '@iconify/svelte';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

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
	import { formatIO } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';

	let { client, fqdn }: { client: PrometheusDriver; fqdn: string } = $props();

	const STEP_SECONDS = 60;
	const TIME_RANGE_HOURS = 1;

	const endTime = new Date();
	const startTime = new Date(endTime.getTime() - TIME_RANGE_HOURS * 60 * 60 * 1000);

	let topk = $state(10);
	let rawData = $state<DataPoint[]>([]);
	let isLoading = $state(true);
	let hasError = $state(false);

	async function loadData(t: number) {
		isLoading = true;
		hasError = false;
		try {
			const q = `topk(${t}, sum by (device) (rate(node_network_transmit_bytes_total{instance=~"${fqdn}", device!="lo"}[5m])))`;
			rawData = await fetchFlattenedRange(client, q, startTime, endTime, STEP_SECONDS);
		} catch {
			hasError = true;
		}
		isLoading = false;
	}

	$effect(() => {
		const t = topk; // 追蹤 topk 變化
		untrack(() => loadData(t));
	});

	const chartConfig = $derived(generateChartConfig(rawData));
	const series = $derived(getSeries(chartConfig));
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header>
		<div class="flex">
			<Statistics.Title class="h-8 **:data-[slot=data-table-statistics-title-icon]:size-6">
				<div class="flex flex-col justify-between">
					{m.networking()}
					<p class="text-sm text-muted-foreground">{m.transmitted()}</p>
				</div>
			</Statistics.Title>
			<div class="relative ml-auto">
				<span class="absolute top-1/2 left-3 -translate-y-1/2 items-center">
					<Icon icon="ph:funnel-duotone" />
				</span>
				<Input type="number" bind:value={topk} min={0} step={5} class="h-8 w-22 pl-9 text-lg" />
			</div>
		</div>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if isLoading}
			<div class="flex h-[250px] w-full items-center justify-center">
				<Icon icon="svg-spinners:blocks-wave" class="m-8 size-32 text-muted-foreground/50" />
			</div>
		{:else if hasError || rawData.length === 0}
			<div class="flex h-[250px] w-full flex-col items-center justify-center">
				<Icon icon="ph:chart-line-fill" class="size-60 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
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
							{#snippet formatter({ name, value, payload })}
								{@const top3 = payload
									.map((datum) => datum.value)
									.sort((p, n) => n - p)
									.slice(0, 3)}
								<div
									class="flex w-full shrink-0 items-center justify-between gap-4 leading-none"
									style="--color-bg: var(--color-{name})"
								>
									{#if value !== undefined && value !== null}
										{@const { value: ioValue, unit: ioUnit } = formatIO(Number(value))}
										<span class="flex w-full items-center gap-1">
											<Icon icon="ph:square-fill" class="text-(--color-bg)" />
											<p
												class={top3.includes(value)
													? 'font-bold text-destructive'
													: 'text-foreground'}
											>
												{name}
											</p>
										</span>
										<p
											class={cn(
												'font-mono font-medium whitespace-nowrap tabular-nums',
												top3.includes(value) ? 'font-bold text-destructive' : 'text-foreground'
											)}
										>
											{ioValue.toLocaleString()}
											{ioUnit}
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

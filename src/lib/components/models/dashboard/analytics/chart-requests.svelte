<script lang="ts">
	import { ChartLine, LoaderCircle } from '@lucide/svelte';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import * as Chart from '$lib/components/ui/chart';
	import { m } from '$lib/paraglide/messages';
	import { vllmMetricWithSelector } from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		selectedModel,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		isReloading: boolean;
	} = $props();

	let requestRates = $state([] as SampleValue[]);

	function getRequestsQuery(): string {
		const inner = vllmMetricWithSelector('vllm:request_success_total', namespace, selectedModel);
		return `sum(rate(${inner}[5m]))`;
	}

	const configuration = {
		requests: { label: m.requests(), color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	async function fetch() {
		try {
			const response = await prometheusDriver.rangeQuery(
				getRequestsQuery(),
				Date.now() - 24 * 60 * 60 * 1000,
				Date.now(),
				2 * 60
			);
			requestRates = response.result[0]?.values ?? [];
		} catch {
			requestRates = [];
		}
	}

	const reloadManager = new ReloadManager(fetch);

	let isLoaded = $state(false);
	onMount(() => {
		fetch().then(() => (isLoaded = true));
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header>
		<Statistics.Title>
			<div class="flex flex-col gap-0.5">
				{m.requests()}
				<p class="text-sm font-normal text-muted-foreground">
					{m.llm_dashboard_request_rate_tooltip()}
				</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if requestRates.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{@const data = requestRates.map((s) => ({
				time: s.time,
				requests: !isNaN(Number(s.value)) ? Number(s.value) : 0
			}))}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					{data}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{
							key: 'requests',
							label: configuration.requests.label,
							color: configuration.requests.color
						}
					]}
					props={{
						area: {
							curve: curveMonotoneX,
							'fill-opacity': 0.4,
							line: { class: 'stroke-1' },
							motion: 'tween'
						},
						xAxis: {
							format: (v: Date) =>
								`${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`
						},
						yAxis: { format: () => '' }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip
							indicator="dot"
							labelFormatter={(v: Date) =>
								v.toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: 'numeric'
								})}
						>
							{#snippet formatter({ item, name, value })}
								<div
									style="--color-bg: {item.color}"
									class="flex flex-1 shrink-0 items-center justify-between gap-2 text-xs leading-none"
								>
									<span class="aspect-square shrink-0 rounded-sm border bg-(--color-bg)"></span>
									<span class="text-muted-foreground">{name}</span>
									<p class="font-mono">{Number(value).toFixed(2)} /s</p>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
					{#snippet marks({ series, getAreaProps })}
						{#each series as s, i (s.key)}
							<LinearGradient
								stops={[s.color ?? '', 'color-mix(in lch, ' + s.color + ' 10%, transparent)']}
								vertical
							>
								{#snippet children({ gradient })}
									<Area {...getAreaProps(s, i)} fill={gradient} />
								{/snippet}
							</LinearGradient>
						{/each}
					{/snippet}
				</AreaChart>
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>

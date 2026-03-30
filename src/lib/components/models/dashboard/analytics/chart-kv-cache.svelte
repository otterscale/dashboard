<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Chart from '$lib/components/ui/chart';
	import { m } from '$lib/paraglide/messages';
	import { vllmMetricWithSelector } from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		selectedModel,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();

	let cacheUsage = $state([] as SampleValue[]);

	function getQuery(): string {
		const inner = vllmMetricWithSelector('vllm:kv_cache_usage_perc', namespace, selectedModel);
		return `(avg(${inner}) or vector(0)) * 100`;
	}

	const configuration = {
		usage: { label: m.kv_cache_usage(), color: 'var(--chart-3)' }
	} satisfies Chart.ChartConfig;

	async function fetch() {
		try {
			const response = await prometheusDriver.rangeQuery(
				getQuery(),
				start.getTime(),
				endIsNow ? Date.now() : end.getTime(),
				2 * 60
			);
			cacheUsage = response.result[0]?.values ?? [];
		} catch {
			cacheUsage = [];
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
				{m.kv_cache_usage()}
				<p class="text-sm font-normal text-muted-foreground">
					{m.llm_dashboard_kv_cache_tooltip()}
				</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if cacheUsage.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{@const data = cacheUsage.map((s) => ({
				time: s.time,
				usage: !isNaN(Number(s.value)) ? Number(s.value) : 0
			}))}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					{data}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{ key: 'usage', label: configuration.usage.label, color: configuration.usage.color }
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
						yAxis: { format: (v: number) => `${v}%` }
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
									<p class="font-mono">{Number(value).toFixed(1)}%</p>
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

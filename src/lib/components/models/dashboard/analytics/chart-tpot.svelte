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
		cluster,
		namespace,
		selectedModel,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string | undefined;
		selectedModel: string;
		isReloading: boolean;
	} = $props();

	let p50 = $state([] as SampleValue[]);
	let p99 = $state([] as SampleValue[]);
	const tpotData = $derived(
		p50.map((sample, index) => ({
			time: sample.time,
			p50: !isNaN(Number(sample.value)) ? Number(sample.value) : 0,
			p99: !isNaN(Number(p99[index]?.value)) ? Number(p99[index]?.value) : 0
		}))
	);

	function getTpotQuery(quantile: number): string {
		const bucket = vllmMetricWithSelector(
			'vllm:time_per_output_token_seconds_bucket',
			namespace,
			selectedModel
		);
		return `histogram_quantile(${quantile}, sum by(le) (rate(${bucket}[5m])))`;
	}

	const configuration = {
		p50: { label: 'P50', color: 'var(--chart-1)' },
		p99: { label: 'P99', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;

	async function fetchTpot(quantile: number) {
		try {
			const response = await prometheusDriver.rangeQuery(
				getTpotQuery(quantile),
				Date.now() - 24 * 60 * 60 * 1000,
				Date.now(),
				2 * 60
			);
			if (quantile === 0.5) p50 = response.result[0]?.values ?? [];
			else if (quantile === 0.99) p99 = response.result[0]?.values ?? [];
		} catch {
			if (quantile === 0.5) p50 = [];
			else if (quantile === 0.99) p99 = [];
		}
	}

	async function fetch() {
		try {
			await Promise.all([fetchTpot(0.5), fetchTpot(0.99)]);
		} catch (error) {
			console.error(`Fail to fetch TPOT data in cluster ${cluster}:`, error);
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
				{m.time_per_output_token()}
				<p class="text-sm font-normal text-muted-foreground">{m.llm_dashboard_tpot_tooltip()}</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if tpotData.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					data={tpotData}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{ key: 'p50', label: configuration.p50.label, color: configuration.p50.color },
						{ key: 'p99', label: configuration.p99.label, color: configuration.p99.color }
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
									<p class="font-mono">{Number(value).toFixed(3)} {m.sec()}</p>
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

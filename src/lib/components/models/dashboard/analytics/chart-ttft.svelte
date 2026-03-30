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
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string | undefined;
		selectedModel: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();

	let ninety_fives = $state([] as SampleValue[]);
	let ninety_nines = $state([] as SampleValue[]);
	const times_to_first_token = $derived(
		ninety_fives.map((sample, index) => ({
			time: sample.time,
			p95: !isNaN(Number(sample.value)) ? Number(sample.value) : 0,
			p99: !isNaN(Number(ninety_nines[index]?.value)) ? Number(ninety_nines[index]?.value) : 0
		}))
	);

	function getTtftQuery(quantile: number): string {
		const bucket = vllmMetricWithSelector(
			'vllm:time_to_first_token_seconds_bucket',
			namespace,
			selectedModel
		);
		return `histogram_quantile(${quantile}, sum by(le) (rate(${bucket}[5m])))`;
	}

	const configuration = {
		p95: { label: 'P95', color: 'var(--chart-1)' },
		p99: { label: 'P99', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;

	async function fetchTimesToFirstToken(quantile: number) {
		try {
			const response = await prometheusDriver.rangeQuery(
				getTtftQuery(quantile),
				start.getTime(),
				endIsNow ? Date.now() : end.getTime(),
				2 * 60
			);
			if (quantile === 0.95) ninety_fives = response.result[0]?.values ?? [];
			else if (quantile === 0.99) ninety_nines = response.result[0]?.values ?? [];
		} catch {
			if (quantile === 0.95) ninety_fives = [];
			else if (quantile === 0.99) ninety_nines = [];
		}
	}

	async function fetch() {
		try {
			await Promise.all([fetchTimesToFirstToken(0.95), fetchTimesToFirstToken(0.99)]);
		} catch (error) {
			console.error(`Fail to fetch TTFT data in cluster ${cluster}:`, error);
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
			<div class="flex min-h-[4.5rem] flex-col gap-0.5">
				<span class="line-clamp-1">{m.time_to_first_token()}</span>
				<p class="line-clamp-2 text-sm font-normal text-muted-foreground">
					{m.llm_dashboard_time_to_first_token_tooltip()}
				</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if times_to_first_token.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					data={times_to_first_token}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{ key: 'p95', label: configuration.p95.label, color: configuration.p95.color },
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

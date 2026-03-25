<script lang="ts">
	import Icon from '@iconify/svelte';
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
		namespace: string;
		selectedModel: string;
		isReloading: boolean;
	} = $props();

	let waitingData = $state([] as SampleValue[]);

	function getQuery(): string {
		const inner = vllmMetricWithSelector('vllm:num_requests_waiting', namespace, selectedModel);
		return `sum(${inner})`;
	}

	const configuration = {
		waiting: { label: m.requests_waiting(), color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	async function fetch() {
		try {
			const response = await prometheusDriver.rangeQuery(
				getQuery(),
				Date.now() - 24 * 60 * 60 * 1000,
				Date.now(),
				2 * 60
			);
			waitingData = response.result[0]?.values ?? [];
		} catch {
			waitingData = [];
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
				{m.requests_waiting()}
				<p class="text-sm font-normal text-muted-foreground">{m.llm_dashboard_requests_waiting_tooltip()}</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<Icon icon="svg-spinners:6-dots-rotate" class="size-12" />
			</div>
		{:else if waitingData.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<Icon icon="ph:chart-line-fill" class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{@const data = waitingData.map((s) => ({ time: s.time, waiting: !isNaN(Number(s.value)) ? Number(s.value) : 0 }))}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					data={data}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[{ key: 'waiting', label: configuration.waiting.label, color: configuration.waiting.color }]}
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
								})
							}
						>
							{#snippet formatter({ item, name, value })}
								<div
									style="--color-bg: {item.color}"
									class="flex flex-1 shrink-0 items-center justify-between gap-2 text-xs leading-none"
								>
									<span class="aspect-square shrink-0 rounded-sm border bg-(--color-bg)"></span>
									<span class="text-muted-foreground">{name}</span>
									<p class="font-mono">{Number(value).toFixed(0)}</p>
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

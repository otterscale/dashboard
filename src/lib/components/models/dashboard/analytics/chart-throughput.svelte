<script lang="ts">
	import { ChartLine, LoaderCircle } from '@lucide/svelte';
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
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		selectedModel: string;
		isReloading: boolean;
	} = $props();

	let prompts = $state([] as SampleValue[]);
	let generations = $state([] as SampleValue[]);
	const throughputs = $derived(
		prompts.map((sample, index) => ({
			time: sample.time,
			prompt: sample.value,
			generation: generations[index]?.value ?? null
		}))
	);

	function getThroughputQuery(metric: 'prompt' | 'generation'): string {
		const metricName =
			metric === 'prompt' ? 'vllm:prompt_tokens_total' : 'vllm:generation_tokens_total';
		const inner = vllmMetricWithSelector(metricName, namespace, selectedModel);
		return `sum(rate(${inner}[2m]))`;
	}

	const configuration = {
		prompt: { label: 'Prompt', color: 'var(--chart-1)' },
		generation: { label: 'Generation', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;

	async function fetchPrompts() {
		try {
			const response = await prometheusDriver.rangeQuery(
				getThroughputQuery('prompt'),
				Date.now() - 24 * 60 * 60 * 1000,
				Date.now(),
				2 * 60
			);
			prompts = response.result[0]?.values ?? [];
		} catch {
			prompts = [];
		}
	}

	async function fetchGenerations() {
		try {
			const response = await prometheusDriver.rangeQuery(
				getThroughputQuery('generation'),
				Date.now() - 24 * 60 * 60 * 1000,
				Date.now(),
				2 * 60
			);
			generations = response.result[0]?.values ?? [];
		} catch {
			generations = [];
		}
	}

	async function fetch() {
		await Promise.all([fetchPrompts(), fetchGenerations()]);
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
				{m.throughput()}
				<p class="text-sm font-normal text-muted-foreground">
					{m.llm_dashboard_throughputs_tooltip()}
				</p>
			</div>
		</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if throughputs.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					data={throughputs}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{ key: 'prompt', label: configuration.prompt.label, color: configuration.prompt.color },
						{
							key: 'generation',
							label: configuration.generation.label,
							color: configuration.generation.color
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
									<p class="font-mono">{Number(value).toFixed(2)} {m.per_second()}</p>
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

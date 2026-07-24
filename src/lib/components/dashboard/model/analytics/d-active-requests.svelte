<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import {
		computeStep,
		fetchMultipleFlattenedRange,
		vllmMetricWithSelector
	} from '$lib/prometheus';

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

	type Row = { date: Date; running: number; waiting: number };

	let data = $state<Row[]>([]);
	let isLoaded = $state(false);

	function queries() {
		return {
			running: `sum(${vllmMetricWithSelector('vllm:num_requests_running', namespace, selectedModel)})`,
			waiting: `sum(${vllmMetricWithSelector('vllm:num_requests_waiting', namespace, selectedModel)})`
		};
	}

	const configuration = {
		running: { label: m.running(), color: 'var(--chart-2)' },
		waiting: { label: m.waiting(), color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	const areaProps = {
		curve: curveMonotoneX,
		'fill-opacity': 0.4,
		line: { class: 'stroke-1' },
		motion: 'tween'
	} as const;

	async function fetch() {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs);
			const points = await fetchMultipleFlattenedRange(
				prometheusDriver,
				queries(),
				new Date(startMs),
				new Date(endMs),
				step
			);
			data = points.map((p) => ({
				date: p.date as Date,
				running: Number(p.running ?? 0),
				waiting: Number(p.waiting ?? 0)
			}));
		} catch {
			data = [];
		}
	}

	const reloadManager = new ReloadManager(fetch);

	onMount(() => {
		fetch().then(() => (isLoaded = true));
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	const series = [
		{ key: 'running', label: configuration.running.label, color: configuration.running.color },
		{ key: 'waiting', label: configuration.waiting.label, color: configuration.waiting.color }
	];
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{m.active_requests()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{m.llm_dashboard_active_requests_description()}
			</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_active_requests_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if data.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLine class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					{data}
					x="date"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					{series}
					seriesLayout="stack"
					props={{
						area: areaProps,
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
									style="--color-bg: {item.color}; --color-border: {item.color};"
									class="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 items-center justify-between leading-none">
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<span class="font-mono font-medium text-foreground tabular-nums">
										{Number(value).toFixed(0)}
									</span>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
					{#snippet marks({ context })}
						{#each context.series.visibleSeries as s (s.key)}
							<LinearGradient
								stops={[s.color ?? '', 'color-mix(in lch, ' + s.color + ' 10%, transparent)']}
								vertical
							>
								{#snippet children({ gradient })}
									<Area seriesKey={s.key} {...areaProps} fill={gradient} />
								{/snippet}
							</LinearGradient>
						{/each}
					{/snippet}
				</AreaChart>
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>

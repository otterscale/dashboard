<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LayersIcon from '@lucide/svelte/icons/layers';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveStepAfter } from 'd3-shape';
	import { Area, AreaChart } from 'layerchart';
	import { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import {
		classifyThreshold,
		computeStep,
		thresholdClasses,
		vllmMetricWithSelector
	} from '$lib/prometheus';
	import { cn } from '$lib/utils';

	let {
		prometheusDriver,
		cluster,
		namespace,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();

	let waitingSeries = $state([] as SampleValue[]);
	let swappedSeries = $state([] as SampleValue[]);
	let latestTotal: number | undefined = $state(undefined);
	let latestSwapped = $state(0);

	const configuration = {
		waiting: { label: 'Waiting', color: 'var(--chart-1)' },
		swapped: { label: 'Swapped', color: 'var(--destructive)' }
	} satisfies Chart.ChartConfig;

	function waitingQuery(): string {
		return `sum(${vllmMetricWithSelector('vllm:num_requests_waiting', namespace, undefined)})`;
	}
	function swappedQuery(): string {
		return `sum(${vllmMetricWithSelector('vllm:num_requests_swapped', namespace, undefined)})`;
	}

	async function fetchSeries() {
		try {
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(start.getTime(), endMs);
			const [waitingResp, swappedResp] = await Promise.all([
				prometheusDriver.rangeQuery(waitingQuery(), start.getTime(), endMs, step),
				// `num_requests_swapped` may not exist on every vLLM version; degrade gracefully.
				prometheusDriver.rangeQuery(swappedQuery(), start.getTime(), endMs, step).catch(() => null)
			]);
			waitingSeries = waitingResp.result[0]?.values ?? [];
			swappedSeries = swappedResp?.result[0]?.values ?? [];
		} catch {
			waitingSeries = [];
			swappedSeries = [];
		}
	}

	async function fetchLatest() {
		try {
			const [waitingResp, swappedResp] = await Promise.all([
				prometheusDriver.instantQuery(waitingQuery()),
				prometheusDriver.instantQuery(swappedQuery()).catch(() => null)
			]);
			const w = Number(waitingResp.result[0]?.value?.value ?? 0);
			const s = Number(swappedResp?.result[0]?.value?.value ?? 0);
			latestSwapped = Number.isFinite(s) ? s : 0;
			latestTotal = (Number.isFinite(w) ? w : 0) + latestSwapped;
		} catch {
			latestTotal = undefined;
		}
	}

	async function fetch() {
		try {
			await Promise.all([fetchLatest(), fetchSeries()]);
		} catch (error) {
			console.error(`Fail to fetch queue depth in cluster ${cluster}:`, error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	// swapped > 0 → always red regardless of total magnitude
	const level = $derived(
		latestTotal === undefined
			? 'green'
			: latestSwapped > 0
				? 'red'
				: classifyThreshold(latestTotal, { green: 0, orange: 10 }, 'lower-is-better')
	);
	const colors = $derived(thresholdClasses(level));

	const sparklineData = $derived(
		waitingSeries.map((s, i) => ({
			time: s.time,
			waiting: Number.isFinite(Number(s.value)) ? Number(s.value) : 0,
			swapped: Number.isFinite(Number(swappedSeries[i]?.value))
				? Number(swappedSeries[i]?.value)
				: 0
		}))
	);

	const areaProps = {
		curve: curveStepAfter,
		'fill-opacity': 0.6,
		line: { class: 'stroke-1' },
		motion: 'tween'
	} as const;
</script>

<Card.Root class={cn('h-full gap-2 border', colors.border, colors.bg)}>
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<Card.Title class="flex flex-1 items-center gap-2 truncate text-sm font-medium tracking-tight">
			<LayersIcon class="size-4.5" />
			{m.queue_depth()}
		</Card.Title>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_queue_depth_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<Card.Content>
			<div class="flex h-9 w-full items-center justify-center">
				<Loader2Icon class="size-10 animate-spin" />
			</div>
		</Card.Content>
	{:else if latestTotal == undefined}
		<Card.Content>
			<div class="flex h-full w-full flex-col items-center justify-center">
				<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
				<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex flex-col gap-0.5">
				<div class={cn('text-3xl font-bold', colors.text)}>{latestTotal.toFixed(0)}</div>
				<p class="text-sm text-muted-foreground">
					{m.requests_waiting()}{latestSwapped > 0 ? ` · ${latestSwapped} swapped` : ''}
				</p>
			</div>
			<Chart.Container config={configuration} class="h-full w-20">
				<AreaChart
					data={sparklineData}
					x="time"
					xScale={scaleUtc()}
					axis={false}
					seriesLayout="stack"
					series={[
						{
							key: 'waiting',
							label: configuration.waiting.label,
							color: configuration.waiting.color
						},
						{
							key: 'swapped',
							label: configuration.swapped.label,
							color: configuration.swapped.color
						}
					]}
					props={{ area: areaProps, xAxis: { format: () => '' }, yAxis: { format: () => '' } }}
				>
					{#snippet tooltip()}
						<Chart.Tooltip hideLabel indicator="dot">
							{#snippet formatter({ item, name, value })}
								<div
									style="--color-bg: {item.color}; --color-border: {item.color};"
									class="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 items-center justify-between leading-none">
									<span class="text-muted-foreground">{name}</span>
									<span class="font-mono font-medium tabular-nums text-foreground">
										{Number(value).toFixed(0)}
									</span>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</AreaChart>
			</Chart.Container>
		</Card.Content>
	{/if}
</Card.Root>

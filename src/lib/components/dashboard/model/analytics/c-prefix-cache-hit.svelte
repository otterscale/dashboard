<script lang="ts">
	import ChartLine from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import MoonIcon from '@lucide/svelte/icons/moon';
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
		type ActivityState,
		computeStep,
		fetchMultipleFlattenedRange,
		probeActivity,
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

	type Row = { date: Date; vllm: number; middleware?: number };

	let data = $state<Row[]>([]);
	// The middleware tier only exists when KV Cache Offload is enabled (AI100). Render its
	// series only when the metric actually returns data, so models without an offload tier
	// show just the vLLM line instead of a misleading flat-0% middleware line.
	let hasMiddleware = $state(false);
	let isLoaded = $state(false);
	let activity = $state<ActivityState>('absent');

	function queries(): Record<string, string> {
		const vllmHits = vllmMetricWithSelector(
			'vllm:prefix_cache_hits_total',
			namespace,
			selectedModel
		);
		const vllmQueries = vllmMetricWithSelector(
			'vllm:prefix_cache_queries_total',
			namespace,
			selectedModel
		);
		// The middleware is the KV store behind vLLM, which manages DRAM and SSD behind one lookup.
		// Counted from vLLM's own connector rather than from LMCache: LMCache serves no hits of its
		// own — its local DRAM is a staging buffer and everything found below vLLM comes from the
		// middleware — so vLLM's external counters cover the same events, and both lines then come
		// from one exporter in one unit instead of mixing tokens with LMCache's chunks.
		const middlewareHits = vllmMetricWithSelector(
			'vllm:external_prefix_cache_hits_total',
			namespace,
			selectedModel
		);
		const middlewareQueries = vllmMetricWithSelector(
			'vllm:external_prefix_cache_queries_total',
			namespace,
			selectedModel
		);
		return {
			vllm: `sum(rate(${vllmHits}[5m])) / sum(rate(${vllmQueries}[5m])) * 100`,
			middleware: `sum(rate(${middlewareHits}[5m])) / sum(rate(${middlewareQueries}[5m])) * 100`,
			// Both lines are hit/query ratios, so an idle model divides 0 by 0 and yields NaN for
			// both. The vLLM denominator alone survives that: flat 0 when nothing is served,
			// no series at all when vLLM is not scraped.
			traffic: `sum(rate(${vllmQueries}[5m]))`
		};
	}

	const configuration = {
		vllm: { label: m.cache_hit_vllm(), color: 'var(--chart-2)' },
		middleware: { label: m.cache_hit_middleware(), color: 'var(--chart-3)' }
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
			const raw = await fetchMultipleFlattenedRange(
				prometheusDriver,
				queries(),
				new Date(startMs),
				new Date(endMs),
				computeStep(startMs, endMs)
			);
			activity = probeActivity(raw, 'traffic');
			// A flat `traffic: 0` is finite and would keep points alive, defeating the
			// `length === 0` empty check and drawing a 0% line that reads as a measured miss rate.
			const points = raw.filter((p) => p.vllm !== undefined || p.middleware !== undefined);
			hasMiddleware = points.some((p) => Number.isFinite(Number(p.middleware)));
			data = points.map((p) => ({
				date: p.date as Date,
				vllm: Number.isFinite(Number(p.vllm)) ? Number(p.vllm) : 0,
				...(hasMiddleware
					? { middleware: Number.isFinite(Number(p.middleware)) ? Number(p.middleware) : 0 }
					: {})
			}));
		} catch {
			data = [];
			activity = 'absent';
			hasMiddleware = false;
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

	const series = $derived(
		[
			{ key: 'vllm', label: configuration.vllm.label, color: configuration.vllm.color },
			...(hasMiddleware
				? [
						{
							key: 'middleware',
							label: configuration.middleware.label,
							color: configuration.middleware.color
						}
					]
				: [])
		].map((s) => ({ ...s }))
	);
</script>

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{m.cache_hit_by_tier()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{m.llm_dashboard_cache_tiers_description()}
			</p>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}>
				<InfoIcon class="size-4 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.llm_dashboard_cache_tiers_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if data.length === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center gap-1">
				{#if activity === 'idle'}
					<MoonIcon class="size-12 text-muted-foreground" />
					<p class="text-base text-muted-foreground">{m.no_traffic_display()}</p>
					<p class="text-xs text-muted-foreground">{m.no_traffic_hint()}</p>
				{:else}
					<ChartLine class="size-12 animate-pulse text-muted-foreground" />
					<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
				{/if}
			</div>
		{:else}
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					{data}
					x="date"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					{series}
					props={{
						area: areaProps,
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
									style="--color-bg: {item.color}; --color-border: {item.color};"
									class="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 items-center justify-between leading-none">
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<span class="font-mono font-medium text-foreground tabular-nums">
										{Number(value).toFixed(1)}%
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

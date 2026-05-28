<script lang="ts">
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import {
		computeStep,
		type DataPoint,
		escapePromqlStringLiteral,
		fetchCombinedFlattenedRange
	} from '$lib/prometheus';

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

	let data = $state<DataPoint[]>([]);

	const configuration = {
		stop: { label: m.finish_reason_stop(), color: 'var(--chart-2)' },
		length: { label: m.finish_reason_length(), color: 'var(--chart-1)' },
		abort: { label: m.finish_reason_abort(), color: 'var(--destructive)' }
	} satisfies Chart.ChartConfig;

	const areaProps = {
		curve: curveMonotoneX,
		'fill-opacity': 0.5,
		line: { class: 'stroke-1' },
		motion: 'tween'
	} as const;

	function reasonQuery(reason: string): string {
		// Build metric{namespace="X", finished_reason="reason"} manually since
		// vllmMetricWithSelector only knows about namespace + llm_inference_service.
		const ns = (namespace ?? '').trim();
		const r = escapePromqlStringLiteral(reason);
		const sel = ns
			? `{namespace="${escapePromqlStringLiteral(ns)}",finished_reason="${r}"}`
			: `{finished_reason="${r}"}`;
		return `sum(rate(vllm:request_success_total${sel}[5m]))`;
	}

	function reasonQueries(): Record<string, string> {
		return {
			stop: reasonQuery('stop'),
			length: reasonQuery('length'),
			abort: reasonQuery('abort')
		};
	}

	async function fetch() {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs);
			data = await fetchCombinedFlattenedRange(
				prometheusDriver,
				reasonQueries(),
				new Date(startMs),
				new Date(endMs),
				step
			);
		} catch (error) {
			data = [];
			console.error(`Fail to fetch finish reason in cluster ${cluster}:`, error);
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
</script>

<Card.Root class="h-full">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Card.Title>{m.finish_reason()}</Card.Title>
			<Card.Description>{m.llm_dashboard_finish_reason_description()}</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_finish_reason_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<Card.Content>
			<div class="flex h-45 w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	{:else if data.length === 0}
		<Card.Content>
			<div class="flex h-45 w-full flex-col items-center justify-center gap-2">
				<ChartLineIcon class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-sm text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content>
			<Chart.Container config={configuration} class="h-45 w-full">
				<AreaChart
					{data}
					x="date"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{ key: 'stop', label: configuration.stop.label, color: configuration.stop.color },
						{
							key: 'length',
							label: configuration.length.label,
							color: configuration.length.color
						},
						{ key: 'abort', label: configuration.abort.label, color: configuration.abort.color }
					]}
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
									<span class="text-muted-foreground">{name}</span>
									<span class="font-mono font-medium text-foreground tabular-nums">
										{Number(value).toFixed(2)}/{m.per_second()}
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
		</Card.Content>
	{/if}
</Card.Root>

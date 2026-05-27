<script lang="ts">
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import { computeStep, escapePromqlStringLiteral } from '$lib/prometheus';

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

	let stop = $state([] as SampleValue[]);
	let length = $state([] as SampleValue[]);
	let abort = $state([] as SampleValue[]);

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

	async function fetchOne(
		reason: 'stop' | 'length' | 'abort',
		startMs: number,
		endMs: number,
		step: number
	) {
		try {
			const resp = await prometheusDriver.rangeQuery(reasonQuery(reason), startMs, endMs, step);
			const values = resp.result[0]?.values ?? [];
			if (reason === 'stop') stop = values;
			else if (reason === 'length') length = values;
			else abort = values;
		} catch {
			if (reason === 'stop') stop = [];
			else if (reason === 'length') length = [];
			else abort = [];
		}
	}

	async function fetch() {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs);
			await Promise.all([
				fetchOne('stop', startMs, endMs, step),
				fetchOne('length', startMs, endMs, step),
				fetchOne('abort', startMs, endMs, step)
			]);
		} catch (error) {
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

	// Use stop's time axis as the canonical one; fall back to length/abort if stop is missing.
	const data = $derived(
		(() => {
			const reference = stop.length > 0 ? stop : length.length > 0 ? length : abort;
			if (reference.length === 0) return [];
			const numAt = (arr: SampleValue[], i: number) => {
				const v = Number(arr[i]?.value ?? 0);
				return Number.isFinite(v) ? v : 0;
			};
			return reference.map((sample, i) => ({
				time: sample.time,
				stop: numAt(stop, i),
				length: numAt(length, i),
				abort: numAt(abort, i)
			}));
		})()
	);
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
					x="time"
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

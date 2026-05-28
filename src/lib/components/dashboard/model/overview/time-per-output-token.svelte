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
		fetchCombinedFlattenedRange,
		vllmMetricWithSelector
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

	let times_per_output_token = $state<DataPoint[]>([]);

	function tpotQueries(): Record<string, string> {
		const inner = vllmMetricWithSelector(
			'vllm:request_time_per_output_token_seconds_bucket',
			namespace,
			undefined
		);
		const rate = `sum by(le) (rate(${inner}[5m]))`;
		return {
			p95: `histogram_quantile(0.95, ${rate})`,
			p99: `histogram_quantile(0.99, ${rate})`
		};
	}

	const configuration = {
		p95: { label: 'P95', color: 'var(--chart-1)' },
		p99: { label: 'P99', color: 'var(--chart-2)' }
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
			times_per_output_token = await fetchCombinedFlattenedRange(
				prometheusDriver,
				tpotQueries(),
				new Date(startMs),
				new Date(endMs),
				step
			);
		} catch (error) {
			times_per_output_token = [];
			console.error(`Fail to fetch time per output token data in cluster ${cluster}:`, error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	let isLoaded = $state(false);
	onMount(async () => {
		try {
			await fetch();
			isLoaded = true;
		} catch (error) {
			console.error(`Fail to fetch data in cluster ${cluster}:`, error);
		}
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});
</script>

<Card.Root class="h-full">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Card.Title>{m.time_per_output_token()}</Card.Title>
			<Card.Description>{m.llm_dashboard_time_per_output_token_description()}</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_time_per_output_token_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<Card.Content>
			<div class="flex h-45 w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	{:else if times_per_output_token.length === 0}
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
					data={times_per_output_token}
					x="date"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{
							key: 'p95',
							label: configuration.p95.label,
							color: configuration.p95.color
						},
						{
							key: 'p99',
							label: configuration.p99.label,
							color: configuration.p99.color
						}
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
							labelFormatter={(v: Date) => {
								return v.toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: 'numeric'
								});
							}}
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
										{(Number(value) * 1000).toFixed(0)}
										{m.ms()}
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

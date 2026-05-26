<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import DatabaseIcon from '@lucide/svelte/icons/database';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveLinear } from 'd3-shape';
	import { LineChart } from 'layerchart';
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

	let latestUsage: number | undefined = $state(undefined);
	let usageSeries = $state([] as SampleValue[]);

	const configuration = {
		usage: { label: 'Usage', color: 'var(--chart-3)' }
	} satisfies Chart.ChartConfig;

	function innerMaxPerc(): string {
		// max() not avg() — one hot pod is what matters.
		return `max(${vllmMetricWithSelector('vllm:kv_cache_usage_perc', namespace, undefined)})`;
	}

	async function fetchLatest() {
		try {
			const response = await prometheusDriver.instantQuery(`${innerMaxPerc()} * 100`);
			const v = response.result[0]?.value?.value;
			latestUsage = v == undefined ? undefined : Number(v);
		} catch {
			latestUsage = undefined;
		}
	}

	async function fetchSeries() {
		try {
			const endMs = endIsNow ? Date.now() : end.getTime();
			const response = await prometheusDriver.rangeQuery(
				innerMaxPerc(),
				start.getTime(),
				endMs,
				computeStep(start.getTime(), endMs)
			);
			usageSeries = response.result[0]?.values ?? [];
		} catch {
			usageSeries = [];
		}
	}

	async function fetch() {
		try {
			await Promise.all([fetchLatest(), fetchSeries()]);
		} catch (error) {
			console.error(`Fail to fetch kv cache usage in cluster ${cluster}:`, error);
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

	const level = $derived(
		latestUsage === undefined
			? 'green'
			: classifyThreshold(latestUsage, { green: 70, orange: 85 }, 'lower-is-better')
	);
	const colors = $derived(thresholdClasses(level));
</script>

<Card.Root class={cn('h-full gap-2 border', colors.border, colors.bg)}>
	<Card.Header>
		<Card.Title class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex items-center gap-2 truncate text-sm font-medium tracking-tight">
				<DatabaseIcon class="size-4.5" />
				{m.kv_cache_usage()}
			</div>
			<Tooltip.Root>
				<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
					<InfoIcon class="size-5 text-muted-foreground" />
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>{m.llm_dashboard_kv_cache_tooltip()}</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</Card.Title>
	</Card.Header>
	{#if !isLoaded}
		<Card.Content>
			<div class="flex h-9 w-full items-center justify-center">
				<Loader2Icon class="size-10 animate-spin" />
			</div>
		</Card.Content>
	{:else if latestUsage == undefined}
		<Card.Content>
			<div class="flex h-full w-full flex-col items-center justify-center">
				<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
				<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex flex-col gap-0.5">
				<div class={cn('text-3xl font-bold', colors.text)}>{latestUsage.toFixed(1)}%</div>
				<p class="text-sm text-muted-foreground">{m.kv_cache_usage()}</p>
			</div>
			<Chart.Container config={configuration} class="h-full w-20">
				<LineChart
					data={usageSeries}
					x="time"
					xScale={scaleUtc()}
					axis={false}
					series={[
						{ key: 'value', label: configuration.usage.label, color: configuration.usage.color }
					]}
					props={{
						spline: { curve: curveLinear, motion: 'tween', strokeWidth: 2 },
						xAxis: { format: (v: Date) => v.toLocaleDateString('en-US', { month: 'short' }) },
						highlight: { points: { r: 4 } }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip hideLabel>
							{#snippet formatter({ item, name, value })}
								<div
									style="--color-bg: {item.color}"
									class="aspect-square h-full w-fit shrink-0 border-(--color-border) bg-(--color-bg)"
								></div>
								<div
									class="flex flex-1 shrink-0 items-center justify-between gap-2 text-xs leading-none"
								>
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<p class="font-mono">{(Number(value) * 100).toFixed(1)}%</p>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</LineChart>
			</Chart.Container>
		</Card.Content>
	{/if}
</Card.Root>

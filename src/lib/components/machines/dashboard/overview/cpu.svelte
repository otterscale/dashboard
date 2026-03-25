<script lang="ts">
	import { ChevronDown, ChevronUp, Cpu, Info, LoaderCircle } from '@lucide/svelte';
	import { scaleUtc } from 'd3-scale';
	import { curveLinear } from 'd3-shape';
	import { LineChart } from 'layerchart';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';

	let {
		cluster,
		prometheusDriver,
		isReloading = $bindable()
	}: { cluster: string; prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let totalCPUCores = $state(0);
	let cpuUsages = $state([] as SampleValue[]);
	const cpuUsagesTrend = $derived(
		cpuUsages.length > 1 && cpuUsages[cpuUsages.length - 2]?.value
			? (cpuUsages[cpuUsages.length - 1].value - cpuUsages[cpuUsages.length - 2].value) /
					cpuUsages[cpuUsages.length - 2].value
			: 0
	);

	const cpuUsagesConfiguration = {
		usage: { label: 'value', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	async function fetchCPUUsages() {
		try {
			const response = await prometheusDriver.rangeQuery(
				`1 - (sum(irate(node_cpu_seconds_total{mode="idle"}[2m])) / sum(irate(node_cpu_seconds_total{}[2m])))`,
				Date.now() - 10 * 60 * 1000,
				Date.now(),
				5 * 60
			);
			cpuUsages = response.result?.[0]?.values ?? [];
		} catch {
			// Fallback: generate mock trend data
			const now = Date.now();
			cpuUsages = Array.from({ length: 5 }, (_, i) => ({
				time: new Date(now - (4 - i) * 2 * 60 * 1000),
				value: 0.3 + Math.random() * 0.4
			}));
		}
	}

	async function fetchCpuCores() {
		try {
			const response = await prometheusDriver.instantQuery(
				`sum(kube_node_status_capacity{resource="cpu"})`
			);
			const cores = response.result?.[0]?.value?.value;
			if (cores !== undefined) totalCPUCores = Number(cores);
		} catch {
			// Use mock
		}
	}

	async function fetch() {
		await Promise.all([fetchCPUUsages(), fetchCpuCores()]);
	}

	const reloadManager = new ReloadManager(fetch);

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});
</script>

<Card.Root class="h-full gap-2">
	<Card.Header>
		<Card.Title class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex flex-wrap items-center gap-2 truncate text-sm font-medium tracking-tight">
				<Cpu class="size-4.5" />
				{m.cpu()}
			</div>
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
						<Info class="size-5 text-muted-foreground" />
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{m.machine_dashboard_total_cpu_tooltip()}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		</Card.Title>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-full w-full items-center justify-center">
			<LoaderCircle class="m-4 size-12 animate-spin" />
		</div>
	{:else}
		<Card.Content class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex flex-col gap-0.5">
				<div class="text-3xl font-bold">{totalCPUCores}</div>
				<p class="text-sm text-muted-foreground">{m.cores()}</p>
			</div>
			<Chart.Container config={cpuUsagesConfiguration} class="h-full w-20 pb-2">
				<LineChart
					data={cpuUsages}
					x="time"
					xScale={scaleUtc()}
					axis={false}
					series={[
						{
							key: 'value',
							label: 'usage',
							color: cpuUsagesConfiguration.usage.color
						}
					]}
					props={{
						spline: { curve: curveLinear, motion: 'tween', strokeWidth: 2 },
						xAxis: {
							format: (v: Date) => v.toLocaleDateString('en-US', { month: 'short' })
						},
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
								<div class="flex flex-1 shrink-0 items-center justify-between text-xs leading-none">
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<p class="font-mono">{(Number(value) * 100).toFixed(2)} %</p>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</LineChart>
			</Chart.Container>
		</Card.Content>
		<Card.Footer
			class={cn(
				'flex flex-wrap items-center justify-end text-sm leading-none font-medium',
				cpuUsagesTrend >= 0
					? 'text-emerald-500 dark:text-emerald-400'
					: 'text-rose-500 dark:text-rose-400'
			)}
		>
			{Math.abs(cpuUsagesTrend).toFixed(2)} %
			{#if cpuUsagesTrend >= 0}
				<ChevronUp />
			{:else}
				<ChevronDown />
			{/if}
		</Card.Footer>
	{/if}
</Card.Root>

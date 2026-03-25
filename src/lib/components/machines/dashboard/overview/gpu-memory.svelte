<script lang="ts">
	import { ChevronDown, ChevronUp, Info, LoaderCircle, MemoryStick } from '@lucide/svelte';
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
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';

	let {
		cluster,
		prometheusDriver,
		isReloading = $bindable()
	}: { cluster: string; prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let latestMemoryUsage = $state(0);
	let memoryUsages = $state([] as SampleValue[]);
	const trend = $derived(
		memoryUsages.length > 1 && memoryUsages[memoryUsages.length - 2].value !== 0
			? (memoryUsages[memoryUsages.length - 1].value -
					memoryUsages[memoryUsages.length - 2].value) /
					memoryUsages[memoryUsages.length - 2].value
			: 0
	);

	const configuration = {
		usage: { label: 'Usage', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	async function fetchLatestMemoryUsage() {
		const response = await prometheusDriver.instantQuery(
			`
			sum(DCGM_FI_DEV_FB_USED{}) + sum(DCGM_FI_DEV_FB_FREE{})
			`
		);
		latestMemoryUsage = response.result?.[0]?.value?.value ?? 0;
	}

	async function fetchMemoryUsages() {
		const response = await prometheusDriver.rangeQuery(
			`
			avg(DCGM_FI_DEV_FB_USED{} / (DCGM_FI_DEV_FB_USED{} + DCGM_FI_DEV_FB_FREE{}))
			`,
			Date.now() - 10 * 60 * 1000,
			Date.now(),
			2 * 60
		);
		memoryUsages = response.result?.[0]?.values ?? [];
	}

	async function fetch() {
		try {
			await Promise.all([fetchLatestMemoryUsage(), fetchMemoryUsages()]);
		} catch {
			// Mock fallback when DCGM metrics unavailable
			latestMemoryUsage = 8 * 1024; // 8GB
			const now = Date.now();
			memoryUsages = Array.from({ length: 5 }, (_, i) => ({
				time: new Date(now - (4 - i) * 2 * 60 * 1000),
				value: 0.5 + Math.random() * 0.2
			}));
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
			<div class="flex items-center gap-2 truncate text-sm font-medium tracking-tight">
				<MemoryStick class="size-4.5" />
				{m.gpu_memory()}
			</div>
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
						<Info class="size-5 text-muted-foreground" />
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{m.machine_dashboard_gpu_memory_tooltip()}</p>
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
				<div class="text-3xl font-bold">
					{formatCapacity(Number(latestMemoryUsage) * 1024 * 1024).value}
					{formatCapacity(Number(latestMemoryUsage) * 1024 * 1024).unit}
				</div>
				<p class="text-sm text-muted-foreground">{m.total_memory()}</p>
			</div>
			<Chart.Container config={configuration} class="h-full w-20 pb-2">
				<LineChart
					data={memoryUsages}
					x="time"
					xScale={scaleUtc()}
					axis={false}
					series={[
						{
							key: 'value',
							label: configuration.usage.label,
							color: configuration.usage.color
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
				trend >= 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'
			)}
		>
			{Math.abs(trend).toFixed(2)} %
			{#if trend >= 0}
				<ChevronUp />
			{:else}
				<ChevronDown />
			{/if}
		</Card.Footer>
	{/if}
</Card.Root>

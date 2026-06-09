<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import { scaleBand } from 'd3-scale';
	import { BarChart, Highlight } from 'layerchart';
	import { InstantVector, PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';
	import { cubicInOut } from 'svelte/easing';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatPercentage } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	function buildQuery(): string {
		return `avg by (nodeid) (nodeGPUMemoryPercentage{namespace="kube-system"})`;
	}

	type Row = { node: string; usage: number };

	let memoryUsage: Row[] = $state([]);

	const configuration = {
		usage: { label: 'Usage', color: 'var(--chart-2)' },
		label: { color: 'var(--background)' }
	} satisfies Chart.ChartConfig;

	async function fetch() {
		try {
			const response = await prometheusDriver.instantQuery(buildQuery());
			const instanceVectors: InstantVector[] = response.result;
			memoryUsage = instanceVectors
				.map((iv) => ({
					node: (iv.metric.labels as { nodeid?: string }).nodeid ?? 'unknown',
					usage: Number(iv.value.value)
				}))
				.sort((a, b) => b.usage - a.usage);
		} catch (error) {
			console.error('Failed to fetch VGPU memory usage:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
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

	function chartHeight(rowPx: number): number {
		return Math.max(180, memoryUsage.length * rowPx);
	}
</script>

{#snippet chart(rowPx: number)}
	<div style="height: {chartHeight(rowPx)}px" class="w-full">
		<Chart.Container class="h-full w-full border-r pt-2 pr-8" config={configuration}>
			<BarChart
				labels={{
					offset: 8,
					value: (datum) => `${formatPercentage((datum as Row).usage, 1, 0)}%`,
					style: 'font-size: 1rem; font-weight: 500; fill: var(--muted-foreground);'
				}}
				data={memoryUsage}
				orientation="horizontal"
				yScale={scaleBand().padding(0.25)}
				y="node"
				xDomain={[0, 1]}
				axis="y"
				padding={{ right: 56 }}
				rule={false}
				series={[
					{
						key: 'usage',
						label: configuration.usage.label,
						color: configuration.usage.color
					}
				]}
				props={{
					bars: {
						stroke: 'none',
						motion: {
							x: { type: 'tween', duration: 400, easing: cubicInOut },
							width: { type: 'tween', duration: 400, easing: cubicInOut }
						}
					},
					highlight: { area: false },
					yAxis: {
						tickLabelProps: {
							textAnchor: 'start',
							dx: 8,
							class: 'stroke-none fill-background!'
						},
						tickLength: 0
					}
				}}
			>
				{#snippet belowMarks()}
					<Highlight area={{ class: 'fill-muted' }} />
				{/snippet}

				{#snippet tooltip({ context })}
					<Chart.Tooltip indicator="dot" label={(context.tooltip.data as Row | undefined)?.node}>
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
									{(Number(value) * 100).toFixed(2)} %
								</span>
							</div>
						{/snippet}
					</Chart.Tooltip>
				{/snippet}
			</BarChart>
		</Chart.Container>
	</div>
{/snippet}

{#snippet header()}
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Card.Title>{m.vgpu()}</Card.Title>
			<Card.Description>{m.vgpu_usage_description()}</Card.Description>
		</div>
		<Sheet.Root>
			<Sheet.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<Maximize2Icon class="size-5 text-muted-foreground" />
			</Sheet.Trigger>
			<Sheet.Content class="flex min-w-[38vw] flex-col gap-4 overflow-auto p-8">
				<Sheet.Header class="p-0">
					<Sheet.Title>{m.vgpu()}</Sheet.Title>
					<Sheet.Description>{m.vgpu_usage_description()}</Sheet.Description>
				</Sheet.Header>
				{@render chart(48)}
			</Sheet.Content>
		</Sheet.Root>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_vgpu_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
{/snippet}

{#if !isLoaded}
	<Card.Root>
		{@render header()}
		<Card.Content>
			<div class="flex h-45 w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root class="h-full">
		{@render header()}
		<Card.Content>
			<ScrollArea class="h-45 w-full">
				{@render chart(36)}
			</ScrollArea>
		</Card.Content>
	</Card.Root>
{/if}

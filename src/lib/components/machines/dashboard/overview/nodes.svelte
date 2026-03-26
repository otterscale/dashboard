<script lang="ts">
	import Info from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { LineChart } from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';

	let {
		prometheusDriver,
		cluster,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; cluster: string; isReloading: boolean } = $props();

	type NodePoint = { date: Date; node: number };

	let totalNodes = $state(0);
	let nodes = $state<NodePoint[]>([]);

	const nodesConfiguration = {
		node: { label: 'Node', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	async function fetchNodeCount() {
		try {
			const response = await prometheusDriver.instantQuery(
				`count(node_uname_info{juju_model="${cluster}"})`
			);
			const count = response.result?.[0]?.value?.value;
			if (count !== undefined) totalNodes = Number(count);
		} catch {
			// keep prior values
		}
	}

	async function fetch() {
		await fetchNodeCount();
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
			<div class="flex flex-col items-start gap-0.5 truncate text-sm font-medium tracking-tight">
				<p class="text-xs text-muted-foreground uppercase">{m.last_6_months()}</p>
				<div class="flex items-center gap-1 text-lg font-medium">
					<TrendingUp class="size-4.5" />
					{#if totalNodes}
						+{totalNodes}
					{/if}
				</div>
			</div>
			<Tooltip.Provider>
				<Tooltip.Root>
					<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
						<Info class="size-5 text-muted-foreground" />
					</Tooltip.Trigger>
					<Tooltip.Content>
						<p>{m.machine_dashboard_nodes_tooltip()}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			</Tooltip.Provider>
		</Card.Title>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-[250px] w-full items-center justify-center">
			<LoaderCircle class="m-4 size-12 animate-spin" />
		</div>
	{:else}
		<Card.Content>
			<Chart.Container config={nodesConfiguration} class="h-[250px] w-full px-2 pt-2">
				<LineChart
					points={{ r: 4 }}
					data={nodes}
					x="date"
					xScale={scaleUtc()}
					axis="x"
					series={[
						{
							key: 'node',
							label: 'Node',
							color: nodesConfiguration.node.color
						}
					]}
					props={{
						spline: { curve: curveMonotoneX, motion: 'tween', strokeWidth: 2 },
						highlight: {
							points: {
								motion: 'none',
								r: 6
							}
						},
						xAxis: {
							format: (v: Date) => v.toLocaleDateString(getLocale(), { month: 'short' })
						}
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip hideLabel />
					{/snippet}
				</LineChart>
			</Chart.Container>
		</Card.Content>
	{/if}
</Card.Root>

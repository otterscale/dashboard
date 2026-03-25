<script lang="ts">
	import { Box, LoaderCircle } from '@lucide/svelte';
	import { PieChart, Text } from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		cluster,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; cluster: string; isReloading: boolean } = $props();

	let totalNodes = $state(0);
	let nodeProportions = $state([
		{ node: 'physical', nodes: 0, color: 'var(--color-physical)' },
		{ node: 'virtual', nodes: 0, color: 'var(--color-virtual)' }
	]);

	const nodeProportionsConfiguration = {
		nodes: { label: 'Nodes' },
		physical: { label: 'Physical', color: 'var(--chart-1)' },
		virtual: { label: 'Virtual', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;

	async function fetchNodeCount() {
		try {
			const [totalRes, virtualRes] = await Promise.all([
				prometheusDriver.instantQuery(`count(node_uname_info{})`),
				prometheusDriver.instantQuery(
					`count(node_dmi_info{product_name=~".*[Vv]irtual.*|.*[Kk][Vv][Mm].*|.*[Vv][Mm][Ww]are.*|.*[Hh]yper-[Vv].*|.*[Xx]en.*"})`
				)
			]);
			const total = Number(totalRes.result?.[0]?.value?.value ?? 0);
			const virtual = Number(virtualRes.result?.[0]?.value?.value ?? 0);
			totalNodes = total;
			nodeProportions = [
				{ node: 'physical', nodes: total - virtual, color: 'var(--color-physical)' },
				{ node: 'virtual', nodes: virtual, color: 'var(--color-virtual)' }
			];
		} catch {
			// no data
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

<Card.Root class="flex h-full flex-col">
	<Card.Header class="gap-0.5">
		<Card.Title>
			<div class="flex items-center gap-1 truncate text-sm font-medium tracking-tight">
				<Box class="size-4.5" />
				{m.node_distribution()}
			</div>
		</Card.Title>
		<Card.Description class="text-xs">
			{m.node_distribution_description()}
		</Card.Description>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-[200px] w-full items-center justify-center">
			<LoaderCircle class="m-4 size-12 animate-spin" />
		</div>
	{:else}
		<Card.Content class="flex-1">
			<Chart.Container
				config={nodeProportionsConfiguration}
				class="mx-auto aspect-square h-[250px]"
			>
				<PieChart
					data={nodeProportions}
					key="node"
					value="nodes"
					c="color"
					innerRadius={60}
					padding={28}
					props={{ pie: { motion: 'tween' } }}
				>
					{#snippet aboveMarks()}
						<Text
							value={String(totalNodes)}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-3xl! font-bold"
							dy={3}
						/>
						<Text
							value="Nodes"
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-muted-foreground! text-muted-foreground"
							dy={22}
						/>
					{/snippet}
					{#snippet tooltip()}
						<Chart.Tooltip hideLabel />
					{/snippet}
				</PieChart>
			</Chart.Container>
		</Card.Content>
	{/if}
</Card.Root>

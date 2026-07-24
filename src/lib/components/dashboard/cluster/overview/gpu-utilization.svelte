<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { ArcChart, Text } from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { fetchCombinedInstant } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let gpuUtilization: number | undefined = $state(undefined);
	let units: number | undefined = $state(undefined);

	// Both scalars come back in a single `or`-unioned instant query.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				utilization: `avg(Device_utilization_desc_of_container{})`,
				units: `count(DCGM_FI_DEV_GPU_UTIL{})`
			});
			gpuUtilization = r.utilization[0]?.value?.value ?? undefined;
			units = r.units[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch GPU utilization:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	const chartConfig = {
		usage: { label: 'Usage' },
		request: { label: 'Request' }
	} satisfies Chart.ChartConfig;
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Card.Title>{m.gpu_utilization()}</Card.Title>
			<Card.Description class="line-clamp-2">
				{m.cluster_dashboard_gpu_utilization_description()}
			</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.cluster_dashboard_gpu_utilization_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if gpuUtilization === undefined || gpuUtilization === null}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="flex-1">
			<Chart.Container config={chartConfig} class="mx-auto aspect-square max-h-[250px]">
				<ArcChart
					value="value"
					outerRadius={-23}
					innerRadius={-13}
					padding={0}
					range={[180, -180]}
					maxValue={100}
					series={[
						{
							key: 'usage',
							data: [{ key: 'usage', value: gpuUtilization }],
							color: 'var(--chart-1)'
						}
					]}
					props={{
						arc: { track: { fill: 'var(--muted)' }, motion: 'tween' },
						tooltip: { context: { hideDelay: 350 } }
					}}
					tooltipContext={false}
				>
					{#snippet aboveMarks()}
						<Text
							value={String(units)}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-3xl! font-bold"
						/>
						<Text
							value="cards"
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-xl! font-bold"
							dy={30}
						/>
					{/snippet}
				</ArcChart>
			</Chart.Container>
			<Card.Footer class="mt-auto w-full">
				<div class="mx-auto grid w-fit grid-cols-2 py-2">
					<p class="col-start-1 row-start-1">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-1 align-middle"></span>
						usage
					</p>
					<p class="col-start-2 row-start-1 ml-auto">
						{Math.round(Number(gpuUtilization ?? 0))} %
					</p>
				</div>
			</Card.Footer>
		</Card.Content>
	{/if}
</Card.Root>

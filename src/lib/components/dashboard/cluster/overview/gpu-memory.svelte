<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { ArcChart, Text } from 'layerchart';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { classifyThreshold, thresholdClasses } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	function pctClass(value: number | undefined): string {
		return thresholdClasses(classifyThreshold(Number(value ?? 0), { green: 70, orange: 90 })).text;
	}

	let memoryUsage: SampleValue | undefined = $state(undefined);
	async function fetchMemoryUsage() {
		const usageResponse = await prometheusDriver.instantQuery(
			`
			100 * 
			sum(Device_memory_desc_of_container{})
			/
			sum(GPUDeviceMemoryLimit{})
			`
		);
		memoryUsage = usageResponse.result[0]?.value ?? undefined;
	}

	let memoryRequest: SampleValue | undefined = $state(undefined);
	async function fetchMemoryRequest() {
		const response = await prometheusDriver.instantQuery(
			`
			100 * sum(vGPU_device_memory_limit_in_bytes{})
			/
			sum(GPUDeviceMemoryLimit{})
			`
		);
		memoryRequest = response.result[0]?.value ?? undefined;
	}

	let allocatableMemory: SampleValue | undefined = $state(undefined);
	async function fetchAllocatableMemory() {
		const response = await prometheusDriver.instantQuery(
			`
			sum(GPUDeviceMemoryLimit{})
			`
		);
		allocatableMemory = response.result[0]?.value?.value ?? undefined;
	}

	async function fetch() {
		try {
			await Promise.all([fetchMemoryUsage(), fetchMemoryRequest(), fetchAllocatableMemory()]);
		} catch (error) {
			console.error('Failed to fetch CPU usage:', error);
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
			<Card.Title>{m.gpu_memory()}</Card.Title>
			<Card.Description class="line-clamp-2">
				{m.cluster_dashboard_gpu_memory_description()}
			</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.cluster_dashboard_gpu_memory_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if memoryUsage === undefined || memoryUsage === null}
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
					padding={23}
					range={[180, -180]}
					maxValue={100}
					series={[
						{
							key: 'request',
							data: [{ key: 'request', ...memoryRequest }],
							color: 'var(--chart-2)'
						},
						{ key: 'usage', data: [{ key: 'usage', ...memoryUsage }], color: 'var(--chart-1)' }
					]}
					props={{
						arc: { track: { fill: 'var(--muted)' }, motion: 'tween' },
						tooltip: { context: { hideDelay: 350 } }
					}}
					tooltipContext={false}
				>
					{#snippet aboveMarks()}
						{@const { value, unit } = formatCapacity(Number(allocatableMemory))}
						<Text
							{value}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-3xl! font-bold"
						/>
						<Text
							value={unit}
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
					<p class="col-start-2 row-start-1 ml-auto {pctClass(memoryUsage?.value)}">
						{Math.round(Number(memoryUsage?.value ?? 0))} %
					</p>
					<p class="col-start-1 row-start-2">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-2 align-middle"></span>
						request
					</p>
					<p class="col-start-2 row-start-2 ml-auto {pctClass(memoryRequest?.value)}">
						{Math.round(Number(memoryRequest?.value ?? 0))} %
					</p>
				</div>
			</Card.Footer>
		</Card.Content>
	{/if}
</Card.Root>

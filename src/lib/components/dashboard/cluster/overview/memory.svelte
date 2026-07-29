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
	import { m } from '$lib/messages';
	import { classifyThreshold, fetchCombinedInstant, thresholdClasses } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Actual consumption (cAdvisor working set) over the same allocatable base as request/limit.
	let memoryUsage: SampleValue | undefined = $state(undefined);
	// Reserved memory — what the scheduler checks; at 100% no new pod can be placed.
	let memoryRequest: SampleValue | undefined = $state(undefined);
	// Memory limit ceiling — above 100% the cluster is over-committed (OOM/eviction risk).
	let memoryLimit: SampleValue | undefined = $state(undefined);
	let allocatableMemory: SampleValue['value'] | undefined = $state(undefined);

	// All four scalars come back in a single HTTP request (one `or`-unioned instant query)
	// to keep Prometheus request fan-out low.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				usage: `100 * sum(container_memory_working_set_bytes{container!=""}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
				request: `100 * sum(kube_pod_container_resource_requests{resource="memory", unit="byte"}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
				limit: `100 * sum(kube_pod_container_resource_limits{resource="memory", unit="byte"}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
				allocatable: `sum(kube_node_status_allocatable{resource="memory", unit="byte"})`
			});
			memoryUsage = r.usage[0]?.value ?? undefined;
			memoryRequest = r.request[0]?.value ?? undefined;
			memoryLimit = r.limit[0]?.value ?? undefined;
			allocatableMemory = r.allocatable[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch memory usage:', error);
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
		request: { label: 'Request' },
		limit: { label: 'Limit' }
	} satisfies Chart.ChartConfig;

	function pctClass(value: number | undefined): string {
		return thresholdClasses(classifyThreshold(Number(value ?? 0), { green: 70, orange: 90 })).text;
	}
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Card.Title>{m.memory()}</Card.Title>
			<Card.Description class="line-clamp-2">
				{m.cluster_dashboard_memory_description()}
			</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.cluster_dashboard_memory_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if !memoryUsage}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="flex-1">
			<Chart.Container config={chartConfig} class="mx-auto aspect-square max-h-[250px]">
				<ArcChart
					value="value"
					outerRadius={-20}
					innerRadius={-10}
					padding={23}
					range={[180, -180]}
					maxValue={100}
					series={[
						{ key: 'limit', data: [{ key: 'limit', ...memoryLimit }], color: 'var(--chart-3)' },
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
				<div class="mx-auto grid w-fit grid-cols-2 gap-x-6 py-2">
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
					<p class="col-start-1 row-start-3">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-3 align-middle"></span>
						limit
					</p>
					<p class="col-start-2 row-start-3 ml-auto {pctClass(memoryLimit?.value)}">
						{Math.round(Number(memoryLimit?.value ?? 0))} %
					</p>
				</div>
			</Card.Footer>
		</Card.Content>
	{/if}
</Card.Root>

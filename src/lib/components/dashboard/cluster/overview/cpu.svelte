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
	import { m } from '$lib/messages';
	import { classifyThreshold, fetchCombinedInstant, thresholdClasses } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Actual consumption (cAdvisor) over the same allocatable base as request/limit, so the
	// three rings are directly comparable.
	let cpuUsage: SampleValue | undefined = $state(undefined);
	// Reserved CPU — this is what the scheduler checks; at 100% no new pod can be placed.
	let cpuRequest: SampleValue | undefined = $state(undefined);
	// CPU limit ceiling — above 100% the cluster is over-committed (throttling/eviction risk).
	let cpuLimit: SampleValue | undefined = $state(undefined);
	let allocatableCPU: SampleValue['value'] | undefined = $state(undefined);

	// All four scalars come back in a single HTTP request (one `or`-unioned instant query)
	// to keep Prometheus request fan-out low.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				usage: `100 * sum(irate(container_cpu_usage_seconds_total{container!=""}[2m])) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
				request: `100 * sum(kube_pod_container_resource_requests{resource="cpu", unit="core"}) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
				limit: `100 * sum(kube_pod_container_resource_limits{resource="cpu", unit="core"}) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
				allocatable: `sum(kube_node_status_allocatable{resource="cpu", unit="core"})`
			});
			cpuUsage = r.usage[0]?.value ?? undefined;
			cpuRequest = r.request[0]?.value ?? undefined;
			cpuLimit = r.limit[0]?.value ?? undefined;
			allocatableCPU = r.allocatable[0]?.value?.value ?? undefined;
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
		request: { label: 'Request' },
		limit: { label: 'Limit' }
	} satisfies Chart.ChartConfig;

	// Higher percentage = closer to saturation, so use the lower-is-better direction.
	function pctClass(value: number | undefined): string {
		return thresholdClasses(classifyThreshold(Number(value ?? 0), { green: 70, orange: 90 })).text;
	}
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Card.Title>{m.cpu()}</Card.Title>
			<Card.Description class="line-clamp-2">
				{m.cluster_dashboard_cpu_description()}
			</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.cluster_dashboard_cpu_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if !cpuUsage}
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
						{ key: 'limit', data: [{ key: 'limit', ...cpuLimit }], color: 'var(--chart-3)' },
						{ key: 'request', data: [{ key: 'request', ...cpuRequest }], color: 'var(--chart-2)' },
						{ key: 'usage', data: [{ key: 'usage', ...cpuUsage }], color: 'var(--chart-1)' }
					]}
					props={{
						arc: { track: { fill: 'var(--muted)' }, motion: 'tween' }
					}}
					tooltipContext={false}
				>
					{#snippet aboveMarks()}
						<Text
							value={String(allocatableCPU)}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-3xl! font-bold"
						/>
						<Text
							value="core"
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
					<p class="col-start-2 row-start-1 ml-auto {pctClass(cpuUsage?.value)}">
						{Math.round(Number(cpuUsage?.value ?? 0))} %
					</p>
					<p class="col-start-1 row-start-2">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-2 align-middle"></span>
						request
					</p>
					<p class="col-start-2 row-start-2 ml-auto {pctClass(cpuRequest?.value)}">
						{Math.round(Number(cpuRequest?.value ?? 0))} %
					</p>
					<p class="col-start-1 row-start-3">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-3 align-middle"></span>
						limit
					</p>
					<p class="col-start-2 row-start-3 ml-auto {pctClass(cpuLimit?.value)}">
						{Math.round(Number(cpuLimit?.value ?? 0))} %
					</p>
				</div>
			</Card.Footer>
		</Card.Content>
	{/if}
</Card.Root>

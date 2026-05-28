<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import BotIcon from '@lucide/svelte/icons/bot';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { scaleUtc } from 'd3-scale';
	import { curveLinear } from 'd3-shape';
	import { LineChart } from 'layerchart';
	import { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/paraglide/messages';
	import { computeStep, vllmMetricWithSelector } from '$lib/prometheus';

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

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const configuration = {
		number: { label: 'Pods', color: 'var(--chart-1)' }
	} satisfies Chart.ChartConfig;

	let latestModels: number | undefined = $state(undefined);
	async function fetchLatestModels() {
		try {
			const response = await client.list({
				cluster: cluster,
				group: 'serving.kserve.io',
				version: 'v1alpha2',
				resource: 'llminferenceservices',
				// Empty namespace means "all namespaces" for cluster admins
				namespace: namespace
			});
			latestModels = response.items.length;
		} catch (error) {
			console.error(
				`Fail to fetch latest available LLMInferenceServices in cluster ${cluster}:`,
				error
			);
		}
	}

	let availablePods = $state([] as SampleValue[]);

	function buildInner(): string {
		return `count by(endpoint) (${vllmMetricWithSelector('vllm:cache_config_info', namespace, undefined)})`;
	}

	async function fetchAvailablePods() {
		try {
			const endMs = endIsNow ? Date.now() : end.getTime();
			const response = await prometheusDriver.rangeQuery(
				buildInner(),
				start.getTime(),
				endMs,
				computeStep(start.getTime(), endMs)
			);
			availablePods = response.result[0]?.values ?? [];
		} catch (error) {
			console.error(`Fail to fetch available pods in cluster ${cluster}:`, error);
		}
	}

	async function fetch() {
		try {
			await Promise.all([fetchLatestModels(), fetchAvailablePods()]);
		} catch (error) {
			console.error(`Fail to fetch models data in cluster ${cluster}:`, error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	let isLoaded = $state(false);
	onMount(async () => {
		try {
			await fetch();
			isLoaded = true;
		} catch (error) {
			console.error(`Fail to fetch data in cluster ${cluster}:`, error);
		}
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
</script>

<Card.Root class="h-full gap-2">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<Card.Title class="flex flex-1 items-center gap-2 truncate text-sm font-medium tracking-tight">
			<BotIcon class="size-4.5" />
			{m.models()}
		</Card.Title>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content>
				<p>{m.llm_dashboard_models_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<Card.Content>
			<div class="flex h-9 w-full items-center justify-center">
				<Loader2Icon class="size-10 animate-spin" />
			</div>
		</Card.Content>
	{:else if latestModels == undefined}
		<Card.Content>
			<div class="flex h-full w-full flex-col items-center justify-center">
				<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
				<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex flex-col gap-0.5">
				<div class="text-3xl font-bold">{latestModels}</div>
				<p class="text-sm text-muted-foreground">{m.models()}</p>
			</div>
			<Chart.Container config={configuration} class="h-full w-20">
				<LineChart
					data={availablePods}
					x="time"
					xScale={scaleUtc()}
					axis={false}
					series={[
						{
							key: 'value',
							label: configuration.number.label,
							color: configuration.number.color
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
						<Chart.Tooltip hideLabel indicator="dot">
							{#snippet formatter({ item, name, value })}
								<div
									style="--color-bg: {item.color}; --color-border: {item.color};"
									class="size-2.5 shrink-0 rounded-[2px] border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 items-center justify-between leading-none">
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<span class="font-mono font-medium text-foreground tabular-nums">{value}</span>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</LineChart>
			</Chart.Container>
		</Card.Content>
	{/if}
</Card.Root>

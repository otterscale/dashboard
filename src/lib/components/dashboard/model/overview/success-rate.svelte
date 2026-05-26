<script lang="ts">
	import CheckCircleIcon from '@lucide/svelte/icons/check-circle';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
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
	import { m } from '$lib/paraglide/messages';
	import {
		classifyThreshold,
		computeStep,
		thresholdClasses,
		vllmMetricWithSelector
	} from '$lib/prometheus';
	import { cn } from '$lib/utils';

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

	// Mode flips to 'totalRate' when failure_total returns no data.
	type Mode = 'successRate' | 'totalRate';
	let mode: Mode = $state('successRate');
	let latestValue: number | undefined = $state(undefined);
	let series = $state([] as SampleValue[]);

	function successInner(): string {
		return `sum(rate(${vllmMetricWithSelector('vllm:request_success_total', namespace, undefined)}[5m]))`;
	}
	function failureInner(): string {
		return `sum(rate(${vllmMetricWithSelector('vllm:request_failure_total', namespace, undefined)}[5m]))`;
	}
	function successRateInstant(): string {
		return `(${successInner()}) / ((${successInner()}) + (${failureInner()})) * 100`;
	}
	function successRateRange(): string {
		return successRateInstant();
	}

	async function instantNumber(query: string): Promise<number | undefined> {
		const resp = await prometheusDriver.instantQuery(query);
		const v = resp.result[0]?.value?.value;
		const n = Number(v);
		return Number.isFinite(n) ? n : undefined;
	}

	async function failureMetricExists(): Promise<boolean> {
		try {
			const resp = await prometheusDriver.instantQuery(failureInner());
			return resp.result.length > 0;
		} catch {
			return false;
		}
	}

	async function fetchSuccessRateMode() {
		const endMs = endIsNow ? Date.now() : end.getTime();
		const [latest, rangeResp] = await Promise.all([
			instantNumber(successRateInstant()),
			prometheusDriver.rangeQuery(
				successRateRange(),
				start.getTime(),
				endMs,
				computeStep(start.getTime(), endMs)
			)
		]);
		latestValue = latest;
		series = rangeResp.result[0]?.values ?? [];
	}

	async function fetchTotalRateMode() {
		const endMs = endIsNow ? Date.now() : end.getTime();
		const [latest, rangeResp] = await Promise.all([
			instantNumber(successInner()),
			prometheusDriver.rangeQuery(
				successInner(),
				start.getTime(),
				endMs,
				computeStep(start.getTime(), endMs)
			)
		]);
		latestValue = latest;
		series = rangeResp.result[0]?.values ?? [];
	}

	async function fetch() {
		try {
			if (mode === 'successRate') {
				if (!(await failureMetricExists())) {
					mode = 'totalRate';
					await fetchTotalRateMode();
					return;
				}
				await fetchSuccessRateMode();
			} else {
				await fetchTotalRateMode();
			}
		} catch (error) {
			console.error(`Fail to fetch success rate in cluster ${cluster}:`, error);
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
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	const level = $derived(
		mode !== 'successRate' || latestValue === undefined
			? 'green'
			: classifyThreshold(latestValue, { green: 99.5, orange: 98 }, 'higher-is-better')
	);
	const colors = $derived(thresholdClasses(level));

	const configuration = {
		value: { label: 'Value', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;
</script>

<Card.Root class={cn('h-full gap-2 border', colors.border, colors.bg)}>
	<Card.Header>
		<Card.Title class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex items-center gap-2 truncate text-sm font-medium tracking-tight">
				<CheckCircleIcon class="size-4.5" />
				{mode === 'successRate' ? m.success_rate() : m.total_requests()}
			</div>
			<Tooltip.Root>
				<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
					<InfoIcon class="size-5 text-muted-foreground" />
				</Tooltip.Trigger>
				<Tooltip.Content>
					<p>
						{mode === 'successRate'
							? m.llm_dashboard_success_rate_tooltip()
							: m.llm_dashboard_total_requests_tooltip()}
					</p>
				</Tooltip.Content>
			</Tooltip.Root>
		</Card.Title>
	</Card.Header>
	{#if !isLoaded}
		<Card.Content>
			<div class="flex h-9 w-full items-center justify-center">
				<Loader2Icon class="size-10 animate-spin" />
			</div>
		</Card.Content>
	{:else if latestValue == undefined}
		<Card.Content>
			<div class="flex h-full w-full flex-col items-center justify-center">
				<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
				<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content class="flex flex-wrap items-center justify-between gap-6">
			<div class="flex flex-col gap-0.5">
				<div class={cn('text-3xl font-bold', colors.text)}>
					{mode === 'successRate'
						? `${latestValue.toFixed(2)}%`
						: `${latestValue.toFixed(2)}/${m.per_second()}`}
				</div>
				<p class="text-sm text-muted-foreground">
					{mode === 'successRate' ? m.success_rate() : m.total_requests()}
				</p>
			</div>
			<Chart.Container config={configuration} class="h-full w-20">
				<LineChart
					data={series}
					x="time"
					xScale={scaleUtc()}
					axis={false}
					series={[
						{ key: 'value', label: configuration.value.label, color: configuration.value.color }
					]}
					props={{
						spline: { curve: curveLinear, motion: 'tween', strokeWidth: 2 },
						xAxis: { format: (v: Date) => v.toLocaleDateString('en-US', { month: 'short' }) },
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
								<div
									class="flex flex-1 shrink-0 items-center justify-between gap-2 text-xs leading-none"
								>
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<p class="font-mono">
										{mode === 'successRate'
											? `${Number(value).toFixed(2)}%`
											: Number(value).toFixed(2)}
									</p>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</LineChart>
			</Chart.Container>
		</Card.Content>
	{/if}
</Card.Root>

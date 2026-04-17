<script lang="ts">
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { m } from '$lib/paraglide/messages';
	import { computeStep } from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		start,
		end,
		endIsNow = false,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		start: Date;
		end: Date;
		endIsNow?: boolean;
		isReloading: boolean;
	} = $props();

	const configuration = {
		usage: { label: 'Usage', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;

	let cpuUsages: SampleValue[] = $state([]);
	async function fetchCPUUsage() {
		const endMs = endIsNow ? Date.now() : end.getTime();
		const rangeEnd = new Date(endMs);
		const step = computeStep(start.getTime(), endMs);
		const response = await prometheusDriver.rangeQuery(
			`avg(rate(kubevirt_vmi_cpu_usage_seconds_total{exported_namespace="${namespace}"}[5m]))`,
			start,
			rangeEnd,
			step
		);
		cpuUsages = response.result[0]?.values ?? [];
	}

	let cpuWait: SampleValue | undefined = $state(undefined);
	async function fetchCPUWait() {
		const response = await prometheusDriver.instantQuery(
			`avg(rate(kubevirt_vmi_vcpu_wait_seconds_total{exported_namespace="${namespace}"}[5m]))`
		);
		cpuWait = response.result[0]?.value ?? undefined;
	}

	let cpuDelay: SampleValue | undefined = $state(undefined);
	async function fetchCPUDelay() {
		const response = await prometheusDriver.instantQuery(
			`avg(rate(kubevirt_vmi_vcpu_delay_seconds_total{exported_namespace="${namespace}"}[5m]))`
		);
		cpuDelay = response.result[0]?.value ?? undefined;
	}

	let isLoaded = $state(false);
	async function fetch() {
		try {
			await Promise.all([fetchCPUUsage(), fetchCPUWait(), fetchCPUDelay()]);
		} catch (error) {
			console.error('Failed to fetch cpu data:', error);
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

	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

{#if !isLoaded}
	<Card.Root class="h-full gap-2">
		<Card.Header class="h-[42px]">
			<Card.Title>{m.cpu_usage()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="flex h-[200px] w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	</Card.Root>
{:else if !cpuUsages?.length}
	<Card.Root class="h-full gap-2">
		<Card.Header class="h-[42px]">
			<Card.Title>{m.cpu_usage()}</Card.Title>
		</Card.Header>
		<Card.Content>
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLineIcon class="size-50 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root class="h-full gap-2">
		<Card.Header>
			<Card.Title>{m.cpu_usage()}</Card.Title>
			<Card.Action class="flex flex-col gap-0.5 text-sm text-muted-foreground">
				{#if cpuWait}
					<div class="flex justify-between gap-2">
						<p>{m.wait()}</p>
						<p class="font-mono">{(Number(cpuWait.value) * 100).toFixed(2)}%</p>
					</div>
				{/if}
				{#if cpuDelay}
					<div class="flex justify-between gap-2">
						<p>{m.delay()}</p>
						<p class="font-mono">{(Number(cpuDelay.value) * 100).toFixed(2)}%</p>
					</div>
				{/if}
			</Card.Action>
		</Card.Header>
		<Card.Content class="h-full">
			<Chart.Container class="h-[200px] w-full px-2 pt-2" config={configuration}>
				<AreaChart
					data={cpuUsages}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{
							key: 'value',
							label: configuration.usage.label,
							color: configuration.usage.color
						}
					]}
					props={{
						area: {
							curve: curveMonotoneX,
							'fill-opacity': 0.4,
							line: { class: 'stroke-1' },
							motion: 'tween'
						},
						xAxis: {
							format: (v: Date) =>
								`${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`
						},
						yAxis: { format: () => '' }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip
							indicator="dot"
							labelFormatter={(v: Date) => {
								return v.toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: 'numeric'
								});
							}}
						>
							{#snippet formatter({ item, name, value })}
								<div
									style="--color-bg: {item.color}"
									class="aspect-square h-full w-fit shrink-0 border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 items-center justify-between text-xs leading-none">
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<p class="font-mono">{(Number(value) * 100).toFixed(2)}%</p>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
					{#snippet marks({ series, getAreaProps })}
						{#each series as s, i (s.key)}
							<LinearGradient
								stops={[s.color ?? '', 'color-mix(in lch, ' + s.color + ' 10%, transparent)']}
								vertical
							>
								{#snippet children({ gradient })}
									<Area {...getAreaProps(s, i)} fill={gradient} />
								{/snippet}
							</LinearGradient>
						{/each}
					{/snippet}
				</AreaChart>
			</Chart.Container>
		</Card.Content>
	</Card.Root>
{/if}

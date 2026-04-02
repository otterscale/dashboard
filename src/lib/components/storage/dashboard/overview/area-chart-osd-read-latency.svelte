<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveLinear } from 'd3-shape';
	import { LineChart } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { m } from '$lib/paraglide/messages';
	import { computeStep } from '$lib/prometheus';

	// Props
	let {
		client,
		cluster: _,
		start,
		end,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		cluster: string;
		start: Date;
		end: Date;
		isReloading: boolean;
	} = $props();
	void _;

	// Constants
	const CHART_TITLE = m.osd();
	const CHART_DESCRIPTION = m.read_latencies();
	const CHART_CONFIG = {
		latency: {
			label: 'Read Latency (ms)',
			color: 'var(--chart-1)'
		}
	} satisfies Chart.ChartConfig;

	// Query
	const PROMETHEUS_QUERY = () =>
		`quantile(0.95, (rate(ceph_osd_op_r_latency_sum{}[5m]) / ` +
		`on(ceph_daemon) rate(ceph_osd_op_r_latency_count{}[5m]) * 1000))`;

	// Data fetching
	let response = $state([] as { date: Date; latency: number }[]);
	let isLoading = $state(true);
	const reloadManager = new ReloadManager(fetch);

	async function fetch(): Promise<void> {
		const step = computeStep(start.getTime(), end.getTime(), 300);
		try {
			const query = PROMETHEUS_QUERY();
			const result = await client.rangeQuery(query, start, end, step);
			const values = result.result?.[0]?.values ?? [];
			response = values.map((v: { time: Date; value: number | string }) => ({
				date: v.time,
				latency: Number(v.value || 0)
			}));
		} catch (error) {
			console.error('Error fetching read latency data:', error);
			response = [];
		}
	}

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	onMount(async () => {
		await fetch();
		isLoading = false;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<Card.Root class="h-[162px]">
	<Card.Header class="flex items-center">
		<div class="grid flex-1 gap-1 text-center sm:text-left">
			<Card.Title>{CHART_TITLE}</Card.Title>
			<Card.Description>{CHART_DESCRIPTION}</Card.Description>
		</div>
	</Card.Header>
	{#if isLoading}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if response.length === 0}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content>
			<Chart.Container config={CHART_CONFIG} class="h-16 w-full p-1">
				<LineChart
					data={response}
					x="date"
					xScale={scaleUtc()}
					axis="x"
					series={[
						{
							key: 'latency',
							label: 'Read Latency',
							color: CHART_CONFIG.latency.color
						}
					]}
					props={{
						spline: { curve: curveLinear, motion: 'tween', strokeWidth: 2 },
						xAxis: {
							format: (v: Date) =>
								`${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`,
							ticks: response.length
						},
						yAxis: { format: () => '' },
						highlight: { points: { r: 4 } }
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

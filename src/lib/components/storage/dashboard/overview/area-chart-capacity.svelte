<script lang="ts">
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveStep } from 'd3-shape';
	import { AreaChart } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatCapacity } from '$lib/formatter';
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
	const CHART_TITLE = m.capacity();
	const CHART_DESCRIPTION = m.capacity_usage_changes();
	const CHART_CONFIG = {
		used: { label: 'Used', color: 'var(--chart-1)' },
		total: { label: 'Total', color: 'var(--chart-3)' }
	} satisfies Chart.ChartConfig;

	// Helper functions
	function getYAxisDomain(
		data: { date: Date; used: number; total: number; available: number }[]
	): [number, number] {
		const maxTotal = Math.max(...data.map((d) => d.total || 0));
		return [0, maxTotal];
	}

	// Auto Update
	let response = $state([] as { date: Date; used: number; total: number; available: number }[]);
	let isLoading = $state(true);
	const reloadManager = new ReloadManager(fetch);

	async function fetch(): Promise<void> {
		const startMs = start.getTime();
		const endMs = end.getTime();
		const step = computeStep(startMs, endMs, 300);

		try {
			const [usedResponse, totalResponse] = await Promise.all([
				client.rangeQuery(`ceph_cluster_total_used_bytes{}`, start, end, step),
				client.rangeQuery(`ceph_cluster_total_bytes{}`, start, end, step)
			]);

			const usedValues = usedResponse.result[0]?.values ?? [];
			const totalValues = totalResponse.result[0]?.values ?? [];

			response = usedValues.map((sample: { time: Date; value: number }, index: number) => ({
				date: sample.time,
				used: Number(sample.value || 0),
				total: Number(totalValues[index]?.value || 0),
				available: Number(totalValues[index]?.value || 0) - Number(sample.value || 0)
			}));
		} catch (error) {
			console.error('Failed to fetch capacity data:', error);
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

<Card.Root class="h-full gap-2">
	<Card.Header class="flex h-[42px] items-center">
		<div class="grid flex-1 gap-1 text-center sm:text-left">
			<Card.Title>{CHART_TITLE}</Card.Title>
			<Card.Description>{CHART_DESCRIPTION}</Card.Description>
		</div>
	</Card.Header>
	{#if isLoading}
		<Card.Content>
			<div class="flex h-[200px] w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	{:else if response.length === 0}
		<Card.Content>
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLineIcon class="size-50 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content>
			<Chart.Container class="h-[200px] w-full px-2 pt-2" config={CHART_CONFIG}>
				<AreaChart
					data={response}
					x="date"
					xScale={scaleUtc()}
					yDomain={getYAxisDomain(response)}
					series={[
						{
							key: 'used',
							label: 'Used',
							color: CHART_CONFIG.used.color
						}
					]}
					seriesLayout="stack"
					props={{
						area: {
							curve: curveStep,
							'fill-opacity': 0.4,
							line: { class: 'stroke-1' },
							motion: 'tween'
						},
						xAxis: {
							format: (v: Date) =>
								`${v.getHours().toString().padStart(2, '0')}:${v.getMinutes().toString().padStart(2, '0')}`,
							ticks: response.length
						},
						yAxis: { format: () => '' }
					}}
				>
					{#snippet tooltip()}
						<Chart.Tooltip
							labelFormatter={(time: Date) => {
								return time.toLocaleDateString('en-US', {
									year: 'numeric',
									month: 'short',
									day: 'numeric',
									hour: 'numeric',
									minute: 'numeric'
								});
							}}
						>
							{#snippet formatter({ item, name, value })}
								{@const { value: io, unit } = formatCapacity(Number(value))}
								<div
									style="--color-bg: {item.color}"
									class="aspect-square h-full w-fit shrink-0 border-(--color-border) bg-(--color-bg)"
								></div>
								<div class="flex flex-1 shrink-0 items-center justify-between text-xs leading-none">
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<p class="font-mono">{io} {unit}</p>
								</div>
							{/snippet}
						</Chart.Tooltip>
					{/snippet}
				</AreaChart>
			</Chart.Container>
		</Card.Content>
	{/if}
</Card.Root>

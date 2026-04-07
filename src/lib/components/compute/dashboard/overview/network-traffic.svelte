<script lang="ts">
	import ChartLineIcon from '@lucide/svelte/icons/chart-line';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { scaleUtc } from 'd3-scale';
	import { curveMonotoneX } from 'd3-shape';
	import { Area, AreaChart, LinearGradient } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatIO } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { computeStep, fetchMultipleFlattenedRange } from '$lib/prometheus';

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
		receive: { label: 'Receive', color: 'var(--chart-1)' },
		transmit: { label: 'Transmit', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;

	type TrafficRow = { time: Date; receive: number; transmit: number };
	let traffics = $state<TrafficRow[]>([]);

	async function fetch() {
		try {
			const endMs = endIsNow ? Date.now() : end.getTime();
			const rangeEnd = new Date(endMs);
			const step = computeStep(start.getTime(), endMs);
			const points = await fetchMultipleFlattenedRange(
				prometheusDriver,
				{
					receive: `avg(rate(kubevirt_vmi_network_receive_bytes_total{exported_namespace="${namespace}"}[5m]))`,
					transmit: `avg(rate(kubevirt_vmi_network_transmit_bytes_total{exported_namespace="${namespace}"}[5m]))`
				},
				start,
				rangeEnd,
				step
			);
			traffics = points.map((p) => ({
				time: p.date as Date,
				receive: Number(p.receive ?? 0),
				transmit: Number(p.transmit ?? 0)
			}));
		} catch (error) {
			console.error('Failed to fetch network data:', error);
			traffics = [];
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
</script>

{#if !isLoaded}
	<Card.Root>
		<Card.Header class="h-[42px]">
			<Card.Title>{m.network_bandwidth()}</Card.Title>
			<Card.Description>{m.receive_and_transmit()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex h-[230px] w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	</Card.Root>
{:else if traffics.length === 0}
	<Card.Root>
		<Card.Header class="h-[42px]">
			<Card.Title>{m.network_bandwidth()}</Card.Title>
			<Card.Description>{m.receive_and_transmit()}</Card.Description>
		</Card.Header>
		<Card.Content>
			<div class="flex h-[230px] w-full flex-col items-center justify-center">
				<ChartLineIcon class="size-50 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	</Card.Root>
{:else}
	<Card.Root>
		<Card.Header>
			<Card.Title>{m.network_bandwidth()}</Card.Title>
			<Card.Description>{m.receive_and_transmit()}</Card.Description>
		</Card.Header>
		<Card.Content class="h-full">
			<Chart.Container class="h-[230px] w-full px-2 pt-2" config={configuration}>
				<AreaChart
					data={traffics}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{
							key: 'receive',
							label: configuration.receive.label,
							color: configuration.receive.color
						},
						{
							key: 'transmit',
							label: configuration.transmit.label,
							color: configuration.transmit.color
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
								{@const { value: io, unit } = formatIO(Number(value))}
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
									<p class="font-mono">{io} {unit}</p>
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

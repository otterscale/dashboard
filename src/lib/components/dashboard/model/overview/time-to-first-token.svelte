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
	import * as Chart from '$lib/components/ui/chart';
	import { m } from '$lib/paraglide/messages';
	import { computeStep } from '$lib/prometheus';

	let {
		prometheusDriver,
		cluster,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading: boolean;
	} = $props();

	let ninety_fives = $state([] as SampleValue[]);
	let ninety_nines = $state([] as SampleValue[]);
	const times_to_first_token = $derived(
		ninety_fives.map((sample, index) => ({
			time: sample.time,
			ninety_five: !isNaN(Number(sample.value)) ? Number(sample.value) : 0,
			ninety_nine: !isNaN(Number(ninety_nines[index]?.value))
				? Number(ninety_nines[index]?.value)
				: 0
		}))
	);

	const configuration = {
		ninety_five: { label: '95', color: 'var(--chart-1)' },
		ninety_nine: { label: '99', color: 'var(--chart-2)' }
	} satisfies Chart.ChartConfig;

	async function fetchTimesToFirstToken(
		quantile: number,
		startMs: number,
		endMs: number,
		step: number
	) {
		const response = await prometheusDriver.rangeQuery(
			`histogram_quantile(${quantile}, sum by(le) (rate(vllm:time_to_first_token_seconds_bucket{}[5m])))`,
			startMs,
			endMs,
			step
		);
		if (quantile === 0.95) {
			ninety_fives = response.result[0]?.values ?? [];
		} else if (quantile === 0.99) {
			ninety_nines = response.result[0]?.values ?? [];
		}
	}

	async function fetch() {
		try {
			const startMs = start.getTime();
			const endMs = endIsNow ? Date.now() : end.getTime();
			const step = computeStep(startMs, endMs);
			await Promise.all([
				fetchTimesToFirstToken(0.95, startMs, endMs, step),
				fetchTimesToFirstToken(0.99, startMs, endMs, step)
			]);
		} catch (error) {
			console.error(`Fail to fetch time to first token data in cluster ${cluster}:`, error);
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

<Card.Root class="h-full">
	<Card.Header>
		<Card.Title>{m.time_to_first_token()}</Card.Title>
		<Card.Description>
			{m.llm_dashboard_time_to_first_token_tooltip()}
		</Card.Description>
	</Card.Header>
	{#if !isLoaded}
		<Card.Content>
			<div class="flex h-[200px] w-full items-center justify-center">
				<Loader2Icon class="size-12 animate-spin" />
			</div>
		</Card.Content>
	{:else if times_to_first_token.length === 0}
		<Card.Content>
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartLineIcon class="size-50 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		</Card.Content>
	{:else}
		<Card.Content>
			<Chart.Container config={configuration} class="h-[200px] w-full">
				<AreaChart
					data={times_to_first_token}
					x="time"
					xScale={scaleUtc()}
					yPadding={[0, 25]}
					series={[
						{
							key: 'ninety_five',
							label: configuration.ninety_five.label,
							color: configuration.ninety_five.color
						},
						{
							key: 'ninety_nine',
							label: configuration.ninety_nine.label,
							color: configuration.ninety_nine.color
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
								<div
									class="flex flex-1 shrink-0 items-center justify-between gap-2 text-xs leading-none"
								>
									<div class="grid gap-1.5">
										<span class="text-muted-foreground">{name}</span>
									</div>
									<p class="font-mono">{Number(value).toFixed(2)} {m.sec()}</p>
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
	{/if}
</Card.Root>

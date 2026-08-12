<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { ArcChart, Text } from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { buttonVariants } from '$lib/components/ui/button';
	import * as Card from '$lib/components/ui/card/index.js';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		classifyThreshold,
		DCGM_GPU_MEMORY_TOTAL_BYTES,
		DCGM_GPU_MEMORY_USED_BYTES,
		fetchCombinedInstant,
		thresholdClasses
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	function pctClass(value: number | undefined): string {
		return thresholdClasses(classifyThreshold(Number(value ?? 0), { green: 70, orange: 90 })).text;
	}

	// Booked by the HAMi scheduler; undefined on clusters without the vGPU stack.
	let allocatedPct: number | undefined = $state(undefined);
	// Measured on the card by DCGM — the numbers a workload cannot hide from.
	let usedPct: number | undefined = $state(undefined);
	let totalBytes: number | undefined = $state(undefined);
	// Shares the 0–100 scale with the memory ratios but answers a different question, so it gets
	// its own ring and color.
	let utilizationPct: number | undefined = $state(undefined);

	// Both ratios share the DCGM physical total so the rings are comparable — the gap between
	// them is the point of this card. HAMi's `hami_gpu_memory_limit_bytes` is the scheduler's
	// pool, which `deviceMemoryScaling` can inflate past the real card, so `allocated` may
	// legitimately exceed 100% (the arc clamps, the legend does not).
	//
	// No `or vector(0)` on either numerator: an absent sum means that stack is not deployed, and
	// a substituted 0 would read as "0% allocated" on a cluster that simply has no HAMi.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				allocatedPct: `100 * sum(hami_gpu_memory_allocated_bytes) / sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
				usedPct: `100 * sum(${DCGM_GPU_MEMORY_USED_BYTES}) / sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
				totalBytes: `sum(${DCGM_GPU_MEMORY_TOTAL_BYTES})`,
				utilizationPct: `avg(DCGM_FI_DEV_GPU_UTIL)`
			});
			allocatedPct = r.allocatedPct[0]?.value?.value ?? undefined;
			usedPct = r.usedPct[0]?.value?.value ?? undefined;
			totalBytes = r.totalBytes[0]?.value?.value ?? undefined;
			utilizationPct = r.utilizationPct[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch GPU usage:', error);
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

	// The arc's own scale stops at 100; an over-committed pool would otherwise wrap past a
	// full turn and read as a small value.
	function arcValue(pct: number | undefined): number {
		return Math.min(100, Math.max(0, Number(pct ?? 0)));
	}

	const chartConfig = {
		allocated: { label: m.gpu_allocated() },
		used: { label: m.usage() },
		utilization: { label: m.utilization() }
	} satisfies Chart.ChartConfig;
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Card.Title>{m.gpu()}</Card.Title>
			<Card.Description class="line-clamp-2">
				{m.cluster_dashboard_gpu_description()}
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
		<!-- Gate on physical capacity: it exists whenever DCGM sees a card, so an idle cluster
		     still renders 0% instead of an empty state. -->
	{:else if totalBytes === undefined || totalBytes === null}
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
						...(allocatedPct === undefined
							? []
							: [
									{
										key: 'allocated',
										data: [{ key: 'allocated', value: arcValue(allocatedPct) }],
										color: 'var(--chart-2)'
									}
								]),
						{
							key: 'used',
							data: [{ key: 'used', value: arcValue(usedPct) }],
							color: 'var(--chart-1)'
						},
						{
							key: 'utilization',
							data: [{ key: 'utilization', value: arcValue(utilizationPct) }],
							color: 'var(--chart-4)'
						}
					]}
					props={{
						arc: { track: { fill: 'var(--muted)' }, motion: 'tween' },
						tooltip: { context: { hideDelay: 350 } }
					}}
					tooltipContext={false}
				>
					{#snippet aboveMarks()}
						{@const total = Number(totalBytes)}
						<!-- A non-numeric sample would reach formatCapacity() and print "NaN KB". -->
						{@const hasTotal = Number.isFinite(total)}
						{@const { value, unit } = formatCapacity(hasTotal ? total : 0)}
						<Text
							value={hasTotal ? value : '—'}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-3xl! font-bold"
						/>
						<Text
							value={hasTotal ? unit : ''}
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
					{#if allocatedPct !== undefined}
						<p class="col-start-1 row-start-1">
							<span class="mr-2 inline-block aspect-square size-3 bg-chart-2 align-middle"></span>
							{m.gpu_allocated()}
						</p>
						<p class="col-start-2 row-start-1 ml-auto {pctClass(allocatedPct)}">
							{Math.round(Number(allocatedPct))} %
						</p>
					{/if}
					<p class="col-start-1 row-start-2">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-1 align-middle"></span>
						{m.usage()}
					</p>
					<p class="col-start-2 row-start-2 ml-auto {pctClass(usedPct)}">
						{Math.round(Number(usedPct ?? 0))} %
					</p>
					<p class="col-start-1 row-start-3">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-4 align-middle"></span>
						{m.utilization()}
					</p>
					<!-- Uncolored: a busy GPU is the goal, so the pressure thresholds don't apply. -->
					<p class="col-start-2 row-start-3 ml-auto">
						{Math.round(Number(utilizationPct ?? 0))} %
					</p>
				</div>
			</Card.Footer>
		</Card.Content>
	{/if}
</Card.Root>

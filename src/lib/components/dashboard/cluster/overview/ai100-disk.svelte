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
		AI100_DEVICE_CLASS,
		ai100DiskRate,
		classifyThreshold,
		deviceClassLabel,
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

	let usedPct: number | undefined = $state(undefined);
	let freeBytes: number | undefined = $state(undefined);
	let totalBytes: number | undefined = $state(undefined);
	// From node_exporter, not TopoLVM — the volume group series only report capacity. Read/write
	// throughput lives in the node table, where it can be attributed to a machine.
	let busyPct: number | undefined = $state(undefined);

	// TopoLVM reports size and available per volume group; used is the difference, since it emits
	// no used series of its own. Scoped to the AI100's device class rather than summing whatever
	// else a node exposes. Absent unless the phison-topolvm module sets
	// `topolvm.node.prometheus.podMonitor.enabled`, in which case the card renders empty.
	const SELECTOR = `{device_class="${AI100_DEVICE_CLASS}"}`;
	const TOTAL = `sum(topolvm_volumegroup_size_bytes${SELECTOR})`;
	const FREE = `sum(topolvm_volumegroup_available_bytes${SELECTOR})`;

	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				usedPct: `100 * (${TOTAL} - ${FREE}) / ${TOTAL}`,
				freeBytes: FREE,
				totalBytes: TOTAL,
				// Fraction of wall-clock spent servicing I/O; averaged, so a fleet reads as "how saturated
				// is a typical drive" rather than a number above 100.
				busyPct: `100 * avg(${ai100DiskRate('node_disk_io_time_seconds_total')})`
			});
			usedPct = r.usedPct[0]?.value?.value ?? undefined;
			freeBytes = r.freeBytes[0]?.value?.value ?? undefined;
			totalBytes = r.totalBytes[0]?.value?.value ?? undefined;
			busyPct = r.busyPct[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch AI100 disk usage:', error);
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

	function arcValue(pct: number | undefined): number {
		return Math.min(100, Math.max(0, Number(pct ?? 0)));
	}

	const chartConfig = {
		usage: { label: m.usage() },
		busy: { label: m.disk_busy() }
	} satisfies Chart.ChartConfig;
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<Card.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid min-w-0 flex-1 gap-1">
			<Card.Title>{deviceClassLabel(AI100_DEVICE_CLASS)} {m.disk()}</Card.Title>
			<Card.Description class="line-clamp-2">
				{m.cluster_dashboard_ai100_description()}
			</Card.Description>
		</div>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.cluster_dashboard_ai100_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
		<!-- Gate on capacity, not usage: it exists whenever TopoLVM manages a pool, so an empty
		     drive renders 0% instead of an empty state. -->
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
						{
							key: 'usage',
							data: [{ key: 'usage', value: arcValue(usedPct) }],
							color: 'var(--chart-1)'
						},
						// Same role and same color as the GPU card's utilization ring: outer ring is how
						// full it is, inner ring is how hard it is working.
						...(busyPct === undefined
							? []
							: [
									{
										key: 'busy',
										data: [{ key: 'busy', value: arcValue(busyPct) }],
										color: 'var(--chart-4)'
									}
								])
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
					<p class="col-start-1 row-start-1">
						<span class="mr-2 inline-block aspect-square size-3 bg-chart-1 align-middle"></span>
						{m.usage()}
					</p>
					<p class="col-start-2 row-start-1 ml-auto {pctClass(usedPct)}">
						{Math.round(Number(usedPct ?? 0))} %
					</p>
					{#if busyPct !== undefined}
						<p class="col-start-1 row-start-2">
							<span class="mr-2 inline-block aspect-square size-3 bg-chart-4 align-middle"></span>
							{m.disk_busy()}
						</p>
						<!-- Uncolored: a drive doing work is the point, not a pressure signal. -->
						<p class="col-start-2 row-start-2 ml-auto">
							{Math.round(Number(busyPct))} %
						</p>
					{/if}
					{#if freeBytes !== undefined}
						{@const free = formatCapacity(Number(freeBytes))}
						<p class="col-start-1 row-start-3 text-muted-foreground">
							<span class="mr-2 inline-block size-3 align-middle"></span>
							{m.free()}
						</p>
						<p class="col-start-2 row-start-3 ml-auto text-muted-foreground">
							{free.value}
							{free.unit}
						</p>
					{/if}
				</div>
			</Card.Footer>
		</Card.Content>
	{/if}
</Card.Root>

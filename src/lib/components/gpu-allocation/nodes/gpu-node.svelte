<script lang="ts">
	import Activity from '@lucide/svelte/icons/activity';
	import Gpu from '@lucide/svelte/icons/gpu';
	import Users from '@lucide/svelte/icons/users';
	import type { Node, NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	import { formatMemory, toPercent } from '../format';
	import type { GpuUtilization, MigSlice } from '../types';

	type GpuNodeData = {
		index: number;
		type: string;
		health: boolean;
		totalMem: number;
		usedMem: number;
		shareCount: number;
		isMig: boolean;
		slices: MigSlice[];
		utilization?: GpuUtilization;
		hasTargetEdge: boolean;
		hasSourceEdge: boolean;
	};

	let { data, selected }: NodeProps<Node<GpuNodeData>> = $props();

	const usedMemPct = $derived(toPercent(data.usedMem, data.totalMem));
	const slices = $derived(data.slices ?? []);

	// Health is carried by the card's border rather than a status dot: a healthy diagram then
	// has no decoration at all, and an unhealthy card is marked without tinting its contents.
	// The red border also holds through hover, which the shared primary hover would eat.
	const cardStateClass = $derived(
		data.health ? 'border-border hover:border-primary/50' : 'border-destructive'
	);

	// Measured usage (DCGM), as opposed to what the HAMi scheduler booked. Absent whenever
	// the exporter reports nothing for this card, in which case the card falls back to the
	// booking-only view it had before.
	const computePct = $derived.by(() => {
		const compute = data.utilization?.compute;
		return compute === undefined ? undefined : Math.min(100, Math.max(0, Math.round(compute)));
	});
	const measuredMem = $derived(data.utilization?.usedMem);
	// Plotted against HAMi's `devmem` so both layers of the bar share one denominator; the
	// card's physical size goes in the tooltip, where the two can differ (deviceMemoryScaling).
	const measuredMemPct = $derived(
		measuredMem === undefined ? undefined : toPercent(measuredMem, data.totalMem)
	);
	// The row reads out the measurement once there is one, and the booking otherwise.
	const memoryText = $derived(
		measuredMem !== undefined
			? `${formatMemory(measuredMem)} / ${formatMemory(data.totalMem)} (${measuredMemPct}%)`
			: `${formatMemory(data.usedMem)} / ${formatMemory(data.totalMem)} (${usedMemPct}%)`
	);
	// Spells out the booking behind the faded layer of the bar, which the row itself
	// only shows once a measurement replaces it.
	const memoryTitle = $derived.by(() => {
		const parts = [`Allocated ${formatMemory(data.usedMem)} of ${formatMemory(data.totalMem)}`];
		if (measuredMem !== undefined) parts.push(`In use ${formatMemory(measuredMem)}`);
		const physical = data.utilization?.totalMem;
		if (physical !== undefined) parts.push(`Card ${formatMemory(physical)}`);
		return parts.join(' · ');
	});
</script>

{#if data.hasTargetEdge}
	<Handle type="target" position={Position.Top} class="bg-chart-4!" />
{/if}

<div
	class="flex {data.isMig
		? 'h-40'
		: 'h-28'} w-52 flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md {cardStateClass} {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
	title={data.health ? undefined : 'This GPU is reported unhealthy by HAMi'}
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-chart-4/10">
			<Gpu size={14} class="text-chart-4" />
		</div>
		<span class="truncate text-sm font-semibold">GPU #{data.index}</span>
		<div class="ml-auto flex shrink-0 items-center gap-1.5">
			{#if computePct !== undefined}
				<!-- Measured utilization rides in the header so it costs the card no height.
					 Whole-card figure: a shared GPU reports one number for every pod on it. -->
				<span
					class="flex items-center gap-0.5 rounded-full bg-chart-2/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-2 tabular-nums"
					title="Compute (SM) utilization of the whole card, measured by DCGM"
				>
					<Activity size={9} />
					{computePct}%
				</span>
			{/if}
			{#if data.isMig}
				<span
					class="rounded-sm bg-chart-3/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-3"
					title="MIG-partitioned GPU"
				>
					MIG
				</span>
			{:else if data.shareCount > 1}
				<span
					class="flex items-center gap-0.5 rounded-full bg-chart-4/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-4"
					title="{data.shareCount} pods sharing this GPU"
				>
					<Users size={10} />
					{data.shareCount}
				</span>
			{/if}
		</div>
	</div>
	<div class="space-y-2 px-3 py-2">
		<div class="truncate text-xs font-medium" title={data.type}>{data.type || 'Unknown'}</div>

		{#if data.isMig}
			<!-- MIG partitions: active instances inferred from pod allocations -->
			{#if slices.length > 0}
				<div class="space-y-1">
					<div class="text-[11px] text-muted-foreground">
						{slices.length} MIG instance{slices.length !== 1 ? 's' : ''}
					</div>
					<div class="flex flex-wrap gap-1">
						{#each slices as slice, i (i)}
							<span
								class="rounded-sm bg-chart-3/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-3"
								title="{slice.profile} · {formatMemory(
									slice.usedMem
								)} · {slice.podNamespace}/{slice.podName}"
							>
								{slice.profile}
							</span>
						{/each}
					</div>
				</div>
			{:else}
				<div class="text-[11px] text-muted-foreground">MIG enabled · no active instances</div>
			{/if}
		{:else}
			<!-- Memory: the faded layer is what HAMi booked, the solid one what DCGM measures in
				 use. Without a measurement the booking is drawn solid, as it was before. -->
			<div class="space-y-1" title={memoryTitle}>
				<div class="flex items-center justify-between text-[11px] text-muted-foreground">
					<span>Memory</span>
					<span>{memoryText}</span>
				</div>
				<div class="relative h-1.5 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="absolute inset-y-0 left-0 rounded-full transition-all {measuredMem !== undefined
							? 'bg-chart-4/30'
							: 'bg-chart-4'}"
						style="width: {usedMemPct}%"
					></div>
					{#if measuredMemPct !== undefined}
						<div
							class="absolute inset-y-0 left-0 rounded-full bg-chart-4 transition-all"
							style="width: {measuredMemPct}%"
						></div>
					{/if}
				</div>
			</div>
		{/if}
	</div>
</div>

{#if data.hasSourceEdge}
	<Handle type="source" position={Position.Bottom} class="bg-chart-4!" />
{/if}

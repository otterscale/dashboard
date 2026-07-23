<script lang="ts">
	import Gpu from '@lucide/svelte/icons/gpu';
	import Users from '@lucide/svelte/icons/users';
	import type { Node, NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	import { formatMemory, toPercent } from '../format';
	import type { MigSlice } from '../types';

	type GpuNodeData = {
		index: number;
		type: string;
		health: boolean;
		totalMem: number;
		usedMem: number;
		shareCount: number;
		isMig: boolean;
		slices: MigSlice[];
		hasTargetEdge: boolean;
		hasSourceEdge: boolean;
	};

	let { data, selected }: NodeProps<Node<GpuNodeData>> = $props();

	const usedMemPct = $derived(toPercent(data.usedMem, data.totalMem));
	const slices = $derived(data.slices ?? []);
</script>

{#if data.hasTargetEdge}
	<Handle type="target" position={Position.Top} class="bg-chart-4!" />
{/if}

<div
	class="flex {data.isMig
		? 'h-40'
		: 'h-28'} w-52 flex-col overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-chart-4/10">
			<Gpu size={14} class="text-chart-4" />
		</div>
		<span class="truncate text-sm font-semibold">GPU #{data.index}</span>
		{#if data.isMig}
			<span
				class="ml-auto rounded-sm bg-chart-3/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-3"
				title="MIG-partitioned GPU"
			>
				MIG
			</span>
		{:else if data.shareCount > 1}
			<span
				class="ml-auto flex items-center gap-0.5 rounded-full bg-chart-4/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-4"
				title="{data.shareCount} pods sharing this GPU"
			>
				<Users size={10} />
				{data.shareCount}
			</span>
		{/if}
		<span
			class="inline-block size-2 shrink-0 rounded-full {data.health
				? 'bg-green-500'
				: 'bg-red-500'} {data.isMig || data.shareCount > 1 ? '' : 'ml-auto'}"
			title={data.health ? 'Healthy' : 'Unhealthy'}
		></span>
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
			<!-- Memory usage: whole GPU or vGPU share -->
			<div class="space-y-1">
				<div class="flex items-center justify-between text-[11px] text-muted-foreground">
					<span>Memory</span>
					<span>{formatMemory(data.usedMem)} / {formatMemory(data.totalMem)} ({usedMemPct}%)</span>
				</div>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full bg-chart-4 transition-all"
						style="width: {usedMemPct}%"
					></div>
				</div>
			</div>
		{/if}
	</div>
</div>

{#if data.hasSourceEdge}
	<Handle type="source" position={Position.Bottom} class="bg-chart-4!" />
{/if}

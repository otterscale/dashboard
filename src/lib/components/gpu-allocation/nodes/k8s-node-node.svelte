<script lang="ts">
	import Server from '@lucide/svelte/icons/server';
	import type { NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	import { formatMemory, toPercent } from '../format';

	let { data, selected }: NodeProps = $props();

	const gpuCount = $derived(Number(data.gpuCount ?? 0));
	const healthyCount = $derived(Number(data.healthyCount ?? gpuCount));
	const totalMem = $derived(Number(data.totalMem ?? 0));
	const usedMem = $derived(Number(data.usedMem ?? 0));
	const usedMemPct = $derived(toPercent(usedMem, totalMem));
	const isMig = $derived(Boolean(data.isMig));
</script>

{#if data.hasTargetEdge}
	<Handle type="target" position={Position.Top} class="bg-chart-3!" />
{/if}

<div
	class="w-56 rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-muted">
			<Server size={14} class="text-muted-foreground" />
		</div>
		<span class="truncate text-sm font-semibold">Node</span>
		{#if isMig}
			<span
				class="ml-auto rounded-sm bg-chart-3/10 px-1.5 py-0.5 text-[10px] font-medium text-chart-3"
				title="This node has MIG-partitioned GPUs"
			>
				MIG
			</span>
		{/if}
		<span
			class="{isMig
				? ''
				: 'ml-auto'} rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
			title="{healthyCount} of {gpuCount} GPUs healthy"
		>
			{healthyCount}/{gpuCount} GPU
		</span>
	</div>
	<div class="space-y-1.5 px-3 py-2">
		<div class="truncate text-xs font-medium" title={String(data.name ?? '')}>{data.name}</div>
		{#if data.gpuType}
			<div class="truncate text-[11px] text-muted-foreground" title={String(data.gpuType)}>
				{data.gpuType}
			</div>
		{/if}
		{#if totalMem > 0}
			<div class="space-y-1 pt-0.5">
				<div class="flex items-center justify-between text-[11px] text-muted-foreground">
					<span>GPU Memory</span>
					<span>{formatMemory(usedMem)} / {formatMemory(totalMem)}</span>
				</div>
				<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
					<div
						class="h-full rounded-full bg-chart-3 transition-all"
						style="width: {usedMemPct}%"
					></div>
				</div>
			</div>
		{/if}
	</div>
</div>

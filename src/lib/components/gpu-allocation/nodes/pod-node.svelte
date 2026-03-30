<script lang="ts">
	import Box from '@lucide/svelte/icons/box';
	import type { NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	let { data, selected }: NodeProps = $props();

	const statusColorMap: Record<string, string> = {
		Running: 'bg-green-500',
		Succeeded: 'bg-green-500',
		Pending: 'bg-yellow-500',
		Failed: 'bg-red-500'
	};

	const statusColor = $derived(statusColorMap[data.status as string] ?? 'bg-muted-foreground');
</script>

{#if data.hasTargetEdge}
	<Handle type="target" position={Position.Top} class="bg-chart-2!" />
{/if}

<div
	class="w-55 rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-chart-2/10">
			<Box size={14} class="text-chart-2" />
		</div>
		<span class="truncate text-sm font-semibold">Pod</span>
		<span class="ml-auto inline-block size-2 shrink-0 rounded-full {statusColor}"></span>
	</div>
	<div class="space-y-1 px-3 py-2">
		<div class="truncate text-xs font-medium">{data.name}</div>
		<div class="text-xs text-muted-foreground">
			{data.gpuCount} GPU{data.gpuCount !== 1 ? 's' : ''} allocated
		</div>
	</div>
</div>

{#if data.hasSourceEdge}
	<Handle type="source" position={Position.Bottom} class="bg-chart-2!" />
{/if}

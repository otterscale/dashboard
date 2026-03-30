<script lang="ts">
	import Server from '@lucide/svelte/icons/server';
	import type { NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	let { data, selected }: NodeProps = $props();
</script>

{#if data.hasTargetEdge}
	<Handle type="target" position={Position.Top} class="bg-chart-3!" />
{/if}

<div
	class="w-55 rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-muted">
			<Server size={14} class="text-muted-foreground" />
		</div>
		<span class="truncate text-sm font-semibold">Node</span>
	</div>
	<div class="space-y-1 px-3 py-2">
		<div class="truncate text-xs font-medium">{data.name}</div>
		<div class="text-xs text-muted-foreground">
			{data.gpuCount} GPU{data.gpuCount !== 1 ? 's' : ''}
			{#if data.gpuType}
				&middot; {data.gpuType}
			{/if}
		</div>
	</div>
</div>

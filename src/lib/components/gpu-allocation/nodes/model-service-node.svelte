<script lang="ts">
	import Bot from '@lucide/svelte/icons/bot';
	import type { NodeProps } from '@xyflow/svelte';
	import { Handle, Position } from '@xyflow/svelte';

	let { data, selected }: NodeProps = $props();
</script>

<div
	class="w-50 rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-primary/10">
			<Bot size={14} class="text-primary" />
		</div>
		<span class="truncate text-sm font-semibold">ModelService</span>
	</div>
	<div class="space-y-1 px-3 py-2">
		<div class="truncate text-xs font-medium">{data.name}</div>
		<div class="truncate text-xs text-muted-foreground">{data.namespace}</div>
	</div>
</div>

{#if data.hasSourceEdge}
	<Handle type="source" position={Position.Bottom} class="bg-primary!" />
{/if}

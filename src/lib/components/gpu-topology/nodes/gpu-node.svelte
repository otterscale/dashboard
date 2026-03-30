<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import Cpu from '@lucide/svelte/icons/cpu';

	import type { NodeProps } from '@xyflow/svelte';

	let { data, selected }: NodeProps = $props();

	const usedMemPct = $derived(
		data.totalMem > 0 ? Math.round((data.usedMem / data.totalMem) * 100) : 0
	);
</script>

<Handle type="target" position={Position.Top} class="!bg-chart-4" />

<div
	class="w-[190px] rounded-lg border border-border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md {selected
		? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
		: ''}"
>
	<div class="flex items-center gap-2 border-b border-border px-3 py-2">
		<div class="flex size-6 items-center justify-center rounded-md bg-chart-4/10">
			<Cpu size={14} class="text-chart-4" />
		</div>
		<span class="truncate text-sm font-semibold">GPU #{data.index}</span>
		<span
			class="ml-auto inline-block size-2 shrink-0 rounded-full {data.health
				? 'bg-green-500'
				: 'bg-red-500'}"
		></span>
	</div>
	<div class="space-y-1.5 px-3 py-2">
		<div class="truncate text-xs font-medium">{data.type || 'Unknown'}</div>
		<div class="text-xs text-muted-foreground">
			{data.usedMem} / {data.totalMem} MiB
		</div>
		<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted">
			<div
				class="h-full rounded-full bg-chart-4 transition-all"
				style="width: {usedMemPct}%"
			></div>
		</div>
	</div>
</div>

<Handle type="source" position={Position.Bottom} class="!bg-chart-4" />

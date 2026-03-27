<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';

	import type { GpuTopologyNodeData } from '../gpu-topology-types';

	let { data }: { data: GpuTopologyNodeData } = $props();
</script>

<Handle type="target" position={Position.Top} />

<div
	class="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 shadow-md dark:border-amber-600 dark:bg-amber-950"
>
	<div class="text-xs font-medium text-amber-600 dark:text-amber-400">Node</div>
	<div class="mt-1 text-sm font-bold text-amber-900 dark:text-amber-100">{data.label}</div>
	{#if data.sublabel}
		<div class="mt-0.5 text-xs text-amber-600 dark:text-amber-400">{data.sublabel}</div>
	{/if}
	{#if data.count !== undefined}
		<div class="mt-1 text-xs text-amber-500 dark:text-amber-300">
			Total GPUs: {data.count}
		</div>
	{/if}
</div>

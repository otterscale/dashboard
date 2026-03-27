<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';

	import type { GpuTopologyNodeData } from '../gpu-topology-types';

	let { data }: { data: GpuTopologyNodeData } = $props();
</script>

<div
	class="rounded-lg border-2 border-purple-400 bg-purple-50 px-4 py-3 shadow-md dark:border-purple-600 dark:bg-purple-950"
>
	<div class="text-xs font-medium text-purple-600 dark:text-purple-400">Pod</div>
	<div class="mt-1 text-sm font-bold text-purple-900 dark:text-purple-100">{data.label}</div>
	{#if data.sublabel}
		<div class="mt-0.5 text-xs text-purple-600 dark:text-purple-400">{data.sublabel}</div>
	{/if}
	{#if data.count !== undefined}
		<div class="mt-1 text-xs text-purple-500 dark:text-purple-300">
			GPUs: {data.count}
		</div>
	{/if}
</div>

<Handle type="source" position={Position.Bottom} />

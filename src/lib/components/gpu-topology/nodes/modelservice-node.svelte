<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';

	import type { GpuTopologyNodeData } from '../gpu-topology-types';

	let { data }: { data: GpuTopologyNodeData } = $props();
</script>

<div
	class="rounded-lg border-2 border-blue-400 bg-blue-50 px-4 py-3 shadow-md dark:border-blue-600 dark:bg-blue-950"
>
	<div class="text-xs font-medium text-blue-600 dark:text-blue-400">ModelService</div>
	<div class="mt-1 text-sm font-bold text-blue-900 dark:text-blue-100">{data.label}</div>
	{#if data.sublabel}
		<div class="mt-0.5 text-xs text-blue-600 dark:text-blue-400">{data.sublabel}</div>
	{/if}
	{#if data.status}
		<div class="mt-1 text-xs text-blue-500 dark:text-blue-300">{data.status}</div>
	{/if}
</div>

<Handle type="source" position={Position.Bottom} />

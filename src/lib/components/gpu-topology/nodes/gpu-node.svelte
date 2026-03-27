<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';

	import type { GpuTopologyNodeData } from '../gpu-topology-types';

	let { data }: { data: GpuTopologyNodeData } = $props();
</script>

<Handle type="target" position={Position.Top} />

<div
	class="rounded-md border-2 px-3 py-2 shadow-sm {data.allocated
		? 'border-green-400 bg-green-50 dark:border-green-600 dark:bg-green-950'
		: 'border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-900'}"
>
	<div
		class="text-xs font-medium {data.allocated
			? 'text-green-600 dark:text-green-400'
			: 'text-gray-500 dark:text-gray-400'}"
	>
		GPU
	</div>
	<div
		class="mt-0.5 text-sm font-semibold {data.allocated
			? 'text-green-900 dark:text-green-100'
			: 'text-gray-700 dark:text-gray-300'}"
	>
		{data.label}
	</div>
	{#if data.sublabel}
		<div
			class="mt-0.5 text-xs {data.allocated
				? 'text-green-600 dark:text-green-400'
				: 'text-gray-400 dark:text-gray-500'}"
		>
			{data.sublabel}
		</div>
	{/if}
</div>

<Handle type="source" position={Position.Bottom} />

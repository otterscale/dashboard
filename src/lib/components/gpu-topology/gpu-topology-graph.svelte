<script lang="ts">
	import { SvelteFlow, Controls, Background, BackgroundVariant } from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';

	import type { GpuTopologyNode, GpuTopologyEdge } from './gpu-topology-types';
	import GpuNode from './nodes/gpu-node.svelte';
	import K8sNode from './nodes/k8s-node.svelte';
	import ModelserviceNode from './nodes/modelservice-node.svelte';
	import PodNode from './nodes/pod-node.svelte';

	let {
		nodes,
		edges
	}: {
		nodes: GpuTopologyNode[];
		edges: GpuTopologyEdge[];
	} = $props();

	const nodeTypes = {
		modelservice: ModelserviceNode,
		gpu: GpuNode,
		k8snode: K8sNode,
		pod: PodNode
	};
</script>

<div class="h-full w-full">
	<SvelteFlow
		{nodes}
		{edges}
		{nodeTypes}
		nodesDraggable={false}
		nodesConnectable={false}
		fitView
		minZoom={0.2}
		maxZoom={2}
	>
		<Controls />
		<Background variant={BackgroundVariant.Dots} />
	</SvelteFlow>
</div>

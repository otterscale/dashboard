<script lang="ts">
	import '@xyflow/svelte/dist/style.css';

	import {
		Background,
		Controls,
		type Edge,
		type Node,
		type NodeTypes,
		Position,
		SvelteFlow
	} from '@xyflow/svelte';

	import { computeLayout } from './layout';
	import GpuNode from './nodes/gpu-node.svelte';
	import K8sNodeNode from './nodes/k8s-node-node.svelte';
	import ModelServiceNode from './nodes/model-service-node.svelte';
	import PodNode from './nodes/pod-node.svelte';
	import type { TopologyData, TopologyView } from './types';

	let {
		topologyData,
		view
	}: {
		topologyData: TopologyData;
		view: TopologyView;
	} = $props();

	const nodeTypes: NodeTypes = {
		modelService: ModelServiceNode as any, // eslint-disable-line @typescript-eslint/no-explicit-any
		pod: PodNode as any, // eslint-disable-line @typescript-eslint/no-explicit-any
		gpu: GpuNode as any, // eslint-disable-line @typescript-eslint/no-explicit-any
		k8sNode: K8sNodeNode as any // eslint-disable-line @typescript-eslint/no-explicit-any
	};

	const layout = $derived.by(() => {
		const rawNodes: Node[] = [];
		const rawEdges: Edge[] = [];

		if (view === 'model-service' && topologyData.modelService) {
			// Layer 1: ModelService
			rawNodes.push({
				id: 'ms',
				type: 'modelService',
				position: { x: 0, y: 0 },
				data: {
					name: topologyData.modelService.name,
					namespace: topologyData.modelService.namespace
				}
			});

			// Layer 2: GPUs (only those allocated by model's pods)
			const allocatedGpuIds = new Set(
				topologyData.pods.flatMap((p) => p.allocations.map((a) => a.uuid))
			);

			for (const gpu of topologyData.gpus) {
				if (!allocatedGpuIds.has(gpu.device.id)) continue;

				const gpuId = `gpu-${gpu.device.id}`;
				const totalUsedMem = gpu.allocatedBy.reduce((sum, a) => sum + a.usedMem, 0);

				rawNodes.push({
					id: gpuId,
					type: 'gpu',
					position: { x: 0, y: 0 },
					data: {
						index: gpu.device.index,
						type: gpu.device.type,
						health: gpu.device.health,
						totalMem: gpu.device.devmem,
						usedMem: totalUsedMem
					}
				});

				rawEdges.push({
					id: `ms-${gpuId}`,
					source: 'ms',
					target: gpuId,
					type: 'smoothstep',
					animated: true
				});
			}

			// Layer 3: Nodes
			for (const node of topologyData.nodes) {
				const nodeId = `node-${node.name}`;
				const gpuType = node.devices[0]?.type ?? '';

				rawNodes.push({
					id: nodeId,
					type: 'k8sNode',
					position: { x: 0, y: 0 },
					data: {
						name: node.name,
						gpuCount: node.devices.length,
						gpuType
					}
				});

				// Edge from each GPU on this node to the node
				for (const device of node.devices) {
					const gpuId = `gpu-${device.id}`;
					if (allocatedGpuIds.has(device.id)) {
						rawEdges.push({
							id: `${gpuId}-${nodeId}`,
							source: gpuId,
							target: nodeId,
							type: 'smoothstep'
						});
					}
				}
			}
		} else if (view === 'node') {
			// Layer 1: Pods
			for (const pod of topologyData.pods) {
				const podId = `pod-${pod.namespace}-${pod.name}`;

				rawNodes.push({
					id: podId,
					type: 'pod',
					position: { x: 0, y: 0 },
					data: {
						name: pod.name,
						status: pod.status,
						gpuCount: pod.allocations.length
					}
				});

				// Edges from Pod to GPU
				for (const alloc of pod.allocations) {
					const gpuId = `gpu-${alloc.uuid}`;
					rawEdges.push({
						id: `${podId}-${gpuId}`,
						source: podId,
						target: gpuId,
						type: 'smoothstep',
						animated: true
					});
				}
			}

			// Layer 2: GPUs
			for (const gpu of topologyData.gpus) {
				const gpuId = `gpu-${gpu.device.id}`;
				const totalUsedMem = gpu.allocatedBy.reduce((sum, a) => sum + a.usedMem, 0);

				rawNodes.push({
					id: gpuId,
					type: 'gpu',
					position: { x: 0, y: 0 },
					data: {
						index: gpu.device.index,
						type: gpu.device.type,
						health: gpu.device.health,
						totalMem: gpu.device.devmem,
						usedMem: totalUsedMem
					}
				});
			}

			// Layer 3: Node(s)
			for (const node of topologyData.nodes) {
				const nodeId = `node-${node.name}`;
				const gpuType = node.devices[0]?.type ?? '';

				rawNodes.push({
					id: nodeId,
					type: 'k8sNode',
					position: { x: 0, y: 0 },
					data: {
						name: node.name,
						gpuCount: node.devices.length,
						gpuType
					}
				});

				// Edges from GPUs to Node
				for (const device of node.devices) {
					const gpuId = `gpu-${device.id}`;
					rawEdges.push({
						id: `${gpuId}-${nodeId}`,
						source: gpuId,
						target: nodeId,
						type: 'smoothstep'
					});
				}
			}
		}

		// Mark which nodes have source/target edges so handles can be hidden when unconnected
		const sources = new Set(rawEdges.map((e) => e.source));
		const targets = new Set(rawEdges.map((e) => e.target));
		for (const node of rawNodes) {
			node.data.hasSourceEdge = sources.has(node.id);
			node.data.hasTargetEdge = targets.has(node.id);
		}

		return computeLayout(rawNodes, rawEdges);
	});

	let nodes = $state<Node[]>([]);
	let edges = $state<Edge[]>([]);

	$effect(() => {
		nodes = layout.nodes;
		edges = layout.edges;
	});
</script>

<div class="gpu-topology-flow h-full w-full">
	<SvelteFlow bind:nodes bind:edges {nodeTypes} fitView minZoom={0.3} maxZoom={2} proOptions={{ hideAttribution: true }}>
		<Background variant="dots" gap={20} />
		<Controls />
	</SvelteFlow>
</div>

<style>
	.gpu-topology-flow :global(.svelte-flow) {
		--xy-background-color: var(--background);
		--xy-node-border-radius: var(--radius);
		--xy-edge-stroke: var(--border);
		--xy-edge-stroke-selected: var(--primary);
		--xy-minimap-background-color: var(--muted);
		--xy-controls-button-background-color: var(--card);
		--xy-controls-button-border-color: var(--border);
		--xy-controls-button-color: var(--foreground);
		--xy-controls-button-background-color-hover: var(--muted);
	}

	.gpu-topology-flow :global(.svelte-flow__edge-path) {
		stroke: var(--border);
		stroke-width: 1.5;
	}

	.gpu-topology-flow :global(.svelte-flow__edge.selected .svelte-flow__edge-path) {
		stroke: var(--primary);
	}

	.gpu-topology-flow :global(.svelte-flow__handle) {
		width: 8px;
		height: 8px;
		border: 2px solid var(--background);
	}

	.gpu-topology-flow :global(.svelte-flow__background) {
		--xy-background-pattern-color: var(--border);
	}
</style>

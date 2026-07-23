<script lang="ts">
	import '@xyflow/svelte/dist/style.css';

	import Info from '@lucide/svelte/icons/info';
	import X from '@lucide/svelte/icons/x';
	import {
		Background,
		BackgroundVariant,
		Controls,
		type Edge,
		type Node,
		type NodeTypes,
		Panel,
		SvelteFlow
	} from '@xyflow/svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';

	import { buildMigSlices, isGpuMigMode } from './hami';
	import { computeLayout } from './layout';
	import GpuNode from './nodes/gpu-node.svelte';
	import K8sNodeNode from './nodes/k8s-node-node.svelte';
	import LLMInferenceServiceNode from './nodes/llm-inference-service-node.svelte';
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
		llmInferenceService: LLMInferenceServiceNode as any, // eslint-disable-line @typescript-eslint/no-explicit-any
		pod: PodNode as any, // eslint-disable-line @typescript-eslint/no-explicit-any
		gpu: GpuNode as any, // eslint-disable-line @typescript-eslint/no-explicit-any
		k8sNode: K8sNodeNode as any // eslint-disable-line @typescript-eslint/no-explicit-any
	};

	// Aggregate GPU memory usage per k8s node (used for the node cards).
	const gpuUsageByNode = $derived.by(() => {
		const map = new SvelteMap<string, { usedMem: number }>();
		for (const gpu of topologyData.gpus) {
			const agg = map.get(gpu.nodeName) ?? { usedMem: 0 };
			agg.usedMem += gpu.allocatedBy.reduce((sum, a) => sum + a.usedMem, 0);
			map.set(gpu.nodeName, agg);
		}
		return map;
	});

	// GPU device IDs running in MIG mode. Reported per-device by HAMi via the
	// `mode` field in node-nvidia-register, so idle MIG GPUs (no pods yet) are
	// detected too, and non-MIG (vGPU / passthrough) GPUs stay off this path.
	const migGpuIds = $derived.by(() => {
		const ids = new SvelteSet<string>();
		for (const gpu of topologyData.gpus) {
			if (isGpuMigMode(gpu.device)) ids.add(gpu.device.id);
		}
		return ids;
	});

	const layout = $derived.by(() => {
		const rawNodes: Node[] = [];
		const rawEdges: Edge[] = [];

		if (view === 'llm-inference-service' && topologyData.llmInferenceService) {
			// Layer 1: LLMInferenceService
			rawNodes.push({
				id: 'isvc',
				type: 'llmInferenceService',
				position: { x: 0, y: 0 },
				data: {
					name: topologyData.llmInferenceService.name,
					namespace: topologyData.llmInferenceService.namespace
				}
			});

			// Layer 2: Pods belonging to the service (only those with GPU allocations)
			const podsWithGpus = topologyData.pods.filter((p) => p.allocations.length > 0);

			for (const pod of podsWithGpus) {
				const podId = `pod-${pod.namespace}-${pod.name}`;

				rawNodes.push({
					id: podId,
					type: 'pod',
					position: { x: 0, y: 0 },
					data: {
						name: pod.name,
						namespace: pod.namespace,
						status: pod.status,
						gpuCount: pod.allocations.length,
						role: pod.role ?? '',
						usedMem: pod.allocations.reduce((sum, a) => sum + a.usedMem, 0),
						isMig: pod.isMig
					}
				});

				rawEdges.push({
					id: `isvc-${podId}`,
					source: 'isvc',
					target: podId,
					type: 'smoothstep',
					animated: true
				});

				// Edges from pod to GPUs it allocates
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

			// Layer 3: GPUs (only those allocated by the service's pods)
			const allocatedGpuIds = new Set(
				podsWithGpus.flatMap((p) => p.allocations.map((a) => a.uuid))
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
						nodeName: gpu.nodeName,
						type: gpu.device.type,
						health: gpu.device.health,
						totalMem: gpu.device.devmem,
						usedMem: totalUsedMem,
						shareCount: gpu.allocatedBy.length,
						isMig: migGpuIds.has(gpu.device.id),
						slices: isGpuMigMode(gpu.device) ? buildMigSlices(gpu.allocatedBy) : []
					}
				});
			}

			// Layer 4: Nodes
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
						gpuType,
						totalMem: node.devices.reduce((sum, d) => sum + d.devmem, 0),
						usedMem: gpuUsageByNode.get(node.name)?.usedMem ?? 0,
						healthyCount: node.devices.filter((d) => d.health).length,
						isMig: node.devices.some((d) => migGpuIds.has(d.id))
					}
				});

				// Edge from each allocated GPU on this node to the node
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
						namespace: pod.namespace,
						status: pod.status,
						gpuCount: pod.allocations.length,
						role: pod.role ?? '',
						usedMem: pod.allocations.reduce((sum, a) => sum + a.usedMem, 0),
						isMig: pod.isMig
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
						nodeName: gpu.nodeName,
						type: gpu.device.type,
						health: gpu.device.health,
						totalMem: gpu.device.devmem,
						usedMem: totalUsedMem,
						shareCount: gpu.allocatedBy.length,
						isMig: migGpuIds.has(gpu.device.id),
						slices: isGpuMigMode(gpu.device) ? buildMigSlices(gpu.allocatedBy) : []
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
						gpuType,
						totalMem: node.devices.reduce((sum, d) => sum + d.devmem, 0),
						usedMem: gpuUsageByNode.get(node.name)?.usedMem ?? 0,
						healthyCount: node.devices.filter((d) => d.health).length,
						isMig: node.devices.some((d) => migGpuIds.has(d.id))
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
	let legendOpen = $state(false);

	$effect(() => {
		nodes = layout.nodes;
		edges = layout.edges;
	});
</script>

<div class="gpu-allocation-flow h-full w-full">
	<SvelteFlow
		bind:nodes
		bind:edges
		{nodeTypes}
		fitView
		minZoom={0.3}
		maxZoom={2}
		proOptions={{ hideAttribution: true }}
	>
		<Background variant={'dots' as BackgroundVariant} gap={20} />
		<Controls />
		<Panel position="top-right">
			{#if !legendOpen}
				<button
					type="button"
					class="flex items-center gap-1 rounded-lg border border-border bg-card/95 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
					title="Show legend"
					onclick={() => (legendOpen = true)}
				>
					<Info size={12} />
					Legend
				</button>
			{:else}
				<div
					class="flex flex-col gap-1.5 rounded-lg border border-border bg-card/95 px-3 py-2 text-[11px] shadow-sm backdrop-blur"
				>
					<div class="mb-0.5 flex items-center justify-between gap-4">
						<span class="font-semibold text-muted-foreground">Legend</span>
						<button
							type="button"
							class="-mr-1 rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
							title="Hide legend"
							onclick={() => (legendOpen = false)}
						>
							<X size={12} />
						</button>
					</div>
					{#if view === 'llm-inference-service'}
						<div class="flex items-center gap-2">
							<span class="size-2.5 rounded-full bg-primary"></span>
							<span>LLM Inference Service</span>
						</div>
					{/if}
					<div class="flex items-center gap-2">
						<span class="size-2.5 rounded-full bg-chart-2"></span>
						<span>Pod (workload)</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="size-2.5 rounded-full bg-chart-4"></span>
						<span>GPU device</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="size-2.5 rounded-full bg-muted-foreground"></span>
						<span>Node (host)</span>
					</div>
					<div class="flex items-center gap-2">
						<span class="rounded-sm bg-chart-3/10 px-1 text-[9px] font-medium text-chart-3"
							>MIG</span
						>
						<span>MIG partition</span>
					</div>
					<div class="mt-1 flex items-center gap-2 border-t border-border pt-1.5">
						<span class="h-0.5 w-4 rounded-full bg-primary"></span>
						<span>Active allocation</span>
					</div>
				</div>
			{/if}
		</Panel>
	</SvelteFlow>
</div>

<style>
	.gpu-allocation-flow :global(.svelte-flow) {
		--xy-background-color: var(--background);
		--xy-node-border-radius: var(--radius);
		--xy-edge-stroke: var(--muted-foreground);
		--xy-edge-stroke-selected: var(--primary);
		--xy-minimap-background-color: var(--muted);
		--xy-controls-button-background-color: var(--card);
		--xy-controls-button-border-color: var(--border);
		--xy-controls-button-color: var(--foreground);
		--xy-controls-button-background-color-hover: var(--muted);
	}

	.gpu-allocation-flow :global(.svelte-flow__edge-path) {
		stroke: var(--muted-foreground);
		stroke-width: 2;
	}

	.gpu-allocation-flow :global(.svelte-flow__edge.animated .svelte-flow__edge-path) {
		stroke: var(--primary);
	}

	.gpu-allocation-flow :global(.svelte-flow__edge.selected .svelte-flow__edge-path),
	.gpu-allocation-flow :global(.svelte-flow__edge:hover .svelte-flow__edge-path) {
		stroke: var(--primary);
		stroke-width: 2.5;
	}

	.gpu-allocation-flow :global(.svelte-flow__handle) {
		width: 8px;
		height: 8px;
		border: 2px solid var(--background);
	}

	.gpu-allocation-flow :global(.svelte-flow__background) {
		--xy-background-pattern-color: var(--border);
	}
</style>

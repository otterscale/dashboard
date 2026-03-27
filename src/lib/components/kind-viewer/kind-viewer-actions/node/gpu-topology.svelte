<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import NetworkIcon from '@lucide/svelte/icons/network';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { CoreV1Node } from '@otterscale/types';
	import { getContext } from 'svelte';

	import GpuTopologyGraph from '$lib/components/gpu-topology/gpu-topology-graph.svelte';
	import { computeLayout } from '$lib/components/gpu-topology/gpu-topology-layout';
	import {
		decodeNodeDevices,
		decodePodDevices,
		HAMI_NODE_NVIDIA_REGISTER,
		HAMI_VGPU_DEVICES_ALLOCATED,
		HAMI_VGPU_NODE,
		type GpuTopologyEdge,
		type GpuTopologyNode,
		type HamiDeviceInfo
	} from '$lib/components/gpu-topology/gpu-topology-types';
	import * as Item from '$lib/components/ui/item';
	import * as Sheet from '$lib/components/ui/sheet';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		object: CoreV1Node;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const nodeName: string = $derived(object?.metadata?.name ?? '');

	let open = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let nodes = $state<GpuTopologyNode[]>([]);
	let edges = $state<GpuTopologyEdge[]>([]);

	async function fetchTopology() {
		isLoading = true;
		error = null;
		nodes = [];
		edges = [];

		try {
			// Decode GPU devices from node's HAMi annotation
			const annotation = object?.metadata?.annotations?.[HAMI_NODE_NVIDIA_REGISTER] ?? '';
			const nodeGpus = decodeNodeDevices(annotation);

			if (nodeGpus.length === 0) {
				error = `No GPU resources detected on node "${nodeName}".`;
				return;
			}

			const gpuType = nodeGpus[0].type;

			// Fetch pods on this node that have HAMi vGPU allocation
			const podResponse = await client.list({
				cluster,
				group: '',
				version: 'v1',
				resource: 'pods',
				fieldSelector: `spec.nodeName=${nodeName}`
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const allPods: any[] = podResponse.items.map((item) => item.object);

			// Build GPU UUID → device info lookup
			const gpuInfoMap = new Map<string, HamiDeviceInfo>();
			for (const gpu of nodeGpus) {
				gpuInfoMap.set(gpu.id, gpu);
			}

			// Extract pod → GPU mappings via HAMi annotation
			const gpuPods: {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				pod: any;
				gpuUuids: string[];
			}[] = [];

			const allocatedGpuIds = new Set<string>();

			for (const pod of allPods) {
				const annos = pod?.metadata?.annotations ?? {};
				const allocatedStr = annos[HAMI_VGPU_DEVICES_ALLOCATED] ?? '';
				if (!allocatedStr) continue;

				// Verify this pod is on our node
				const hamiNode = annos[HAMI_VGPU_NODE];
				if (hamiNode && hamiNode !== nodeName) continue;

				const containerDevices = decodePodDevices(allocatedStr);
				if (containerDevices.length === 0) continue;

				const uuids = containerDevices.map((d) => d.uuid);
				for (const uuid of uuids) {
					allocatedGpuIds.add(uuid);
				}

				gpuPods.push({ pod, gpuUuids: uuids });
			}

			// Build layout items
			// Top layer: pods
			const topItems = gpuPods.map((gp, i) => {
				const podName = gp.pod?.metadata?.name ?? `pod-${i}`;
				const role = gp.pod?.metadata?.labels?.['llm-d.ai/role'];
				return {
					id: `pod-${i}`,
					type: 'pod',
					data: {
						label: podName,
						sublabel: role ? `Role: ${role}` : undefined,
						count: gp.gpuUuids.length
					}
				};
			});

			// Middle layer: all GPU devices on this node
			const middleItems = nodeGpus.map((gpu) => {
				const isAllocated = allocatedGpuIds.has(gpu.id);

				// Find which pod owns this GPU
				const parentIds: string[] = [];
				if (isAllocated) {
					for (let pi = 0; pi < gpuPods.length; pi++) {
						if (gpuPods[pi].gpuUuids.includes(gpu.id)) {
							parentIds.push(`pod-${pi}`);
						}
					}
				}

				return {
					id: `gpu-${gpu.id}`,
					type: 'gpu',
					data: {
						label: `GPU ${gpu.index}`,
						sublabel: `${gpu.type} (${gpu.devmem} MiB)`,
						allocated: isAllocated
					},
					parentIds,
					childIds: ['node-0']
				};
			});

			// Bottom layer: the node itself
			const bottomItems = [
				{
					id: 'node-0',
					type: 'k8snode',
					data: {
						label: nodeName,
						sublabel: gpuType,
						count: nodeGpus.length
					}
				}
			];

			const layout = computeLayout(topItems, middleItems, bottomItems);
			nodes = layout.nodes;
			edges = layout.edges;
		} catch (err) {
			console.error('Failed to fetch GPU topology:', err);
			error = `Failed to fetch GPU topology: ${(err as Error).message}`;
		} finally {
			isLoading = false;
		}
	}

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			fetchTopology();
		}
	}
</script>

<Sheet.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	<Sheet.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<NetworkIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>GPU Topology</Item.Title>
			</Item.Content>
		</Item.Root>
	</Sheet.Trigger>
	<Sheet.Content side="right" class="w-[70vw] sm:max-w-[70vw]">
		<Sheet.Header>
			<Sheet.Title>GPU Topology — {nodeName}</Sheet.Title>
			<Sheet.Description>Pod → GPU → Node</Sheet.Description>
		</Sheet.Header>
		<div class="flex-1 overflow-hidden">
			{#if isLoading}
				<div
					class="flex h-full items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground"
				>
					Loading...
				</div>
			{:else if error}
				<div
					class="flex h-full items-center justify-center rounded-md border bg-muted text-xs text-destructive"
				>
					{error}
				</div>
			{:else if nodes.length > 0}
				<GpuTopologyGraph {nodes} {edges} />
			{:else}
				<div
					class="flex h-full items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground"
				>
					No GPU topology data available.
				</div>
			{/if}
		</div>
	</Sheet.Content>
</Sheet.Root>

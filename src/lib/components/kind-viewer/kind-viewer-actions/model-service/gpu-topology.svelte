<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import NetworkIcon from '@lucide/svelte/icons/network';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { ModelOtterscaleIoV1Alpha1ModelService } from '@otterscale/types';
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
		namespace,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		object: ModelOtterscaleIoV1Alpha1ModelService;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const msName: string = $derived(object?.metadata?.name ?? '');

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
			const acceleratorType = object?.spec?.accelerator?.type ?? 'nvidia';

			// Fetch pods belonging to this ModelService
			const podResponse = await client.list({
				cluster,
				namespace,
				group: '',
				version: 'v1',
				resource: 'pods',
				labelSelector: `llm-d.ai/model=${msName}`
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const pods: any[] = podResponse.items.map((item) => item.object);

			if (pods.length === 0) {
				error = `No serving pods found for ModelService "${msName}". The model service may still be deploying.`;
				return;
			}

			// Gather unique node names from HAMi annotation (preferred) or spec.nodeName
			const nodeNamesSet = new Set<string>();
			for (const pod of pods) {
				const hamiNode = pod?.metadata?.annotations?.[HAMI_VGPU_NODE];
				const specNode = pod?.spec?.nodeName;
				const nodeName = hamiNode || specNode;
				if (nodeName) nodeNamesSet.add(nodeName);
			}
			const nodeNames = [...nodeNamesSet];

			// Fetch node objects
			const nodeObjects = await Promise.all(
				nodeNames.map(async (nodeName: string) => {
					const res = await client.get({
						cluster,
						group: '',
						version: 'v1',
						resource: 'nodes',
						name: nodeName
					});
					return res.resource?.object;
				})
			);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const nodeMap = new Map<string, any>();
			for (const nodeObj of nodeObjects) {
				if (nodeObj) {
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					const name = (nodeObj as any)?.metadata?.name;
					if (name) nodeMap.set(name, nodeObj);
				}
			}

			// Decode GPU devices from each node's HAMi annotation
			const nodeDevicesMap = new Map<string, HamiDeviceInfo[]>();
			for (const [name, nodeObj] of nodeMap) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const annotation = (nodeObj as any)?.metadata?.annotations?.[HAMI_NODE_NVIDIA_REGISTER];
				if (annotation) {
					nodeDevicesMap.set(name, decodeNodeDevices(annotation));
				}
			}

			// Build GPU UUID → device info lookup (across all nodes)
			const gpuDeviceMap = new Map<string, { device: HamiDeviceInfo; nodeName: string }>();
			for (const [nodeName, devices] of nodeDevicesMap) {
				for (const device of devices) {
					gpuDeviceMap.set(device.id, { device, nodeName });
				}
			}

			// Build layout items
			const topItems = [
				{
					id: 'ms-0',
					type: 'modelservice',
					data: {
						label: msName,
						sublabel: `Accelerator: ${acceleratorType}`,
						status: object?.status?.phase ?? 'Unknown'
					}
				}
			];

			const middleItems: {
				id: string;
				type: string;
				data: GpuTopologyNode['data'];
				parentIds: string[];
				childIds: string[];
			}[] = [];

			const bottomItems: {
				id: string;
				type: string;
				data: GpuTopologyNode['data'];
			}[] = [];

			const addedNodeIds = new Set<string>();
			const addedGpuIds = new Set<string>();

			for (const pod of pods) {
				const annos = pod?.metadata?.annotations ?? {};
				const podDevices = decodePodDevices(annos[HAMI_VGPU_DEVICES_ALLOCATED] ?? '');
				const nodeName =
					annos[HAMI_VGPU_NODE] || pod?.spec?.nodeName;

				if (!nodeName) continue;

				// Add node to bottom layer
				const nodeId = `node-${nodeName}`;
				if (!addedNodeIds.has(nodeId)) {
					addedNodeIds.add(nodeId);
					const nodeGpus = nodeDevicesMap.get(nodeName) ?? [];
					const firstGpuType = nodeGpus.length > 0 ? nodeGpus[0].type : 'Unknown';

					bottomItems.push({
						id: nodeId,
						type: 'k8snode',
						data: {
							label: nodeName,
							sublabel: firstGpuType,
							count: nodeGpus.length
						}
					});
				}

				// Create GPU nodes from HAMi pod device allocation
				for (const containerDevice of podDevices) {
					const gpuId = `gpu-${containerDevice.uuid}`;
					if (addedGpuIds.has(gpuId)) {
						// GPU already added by another pod — add parent edge only
						const existing = middleItems.find((m) => m.id === gpuId);
						if (existing && !existing.parentIds.includes('ms-0')) {
							existing.parentIds.push('ms-0');
						}
						continue;
					}
					addedGpuIds.add(gpuId);

					// Look up device info for type/memory
					const gpuInfo = gpuDeviceMap.get(containerDevice.uuid);
					const gpuType = gpuInfo?.device.type ?? containerDevice.type ?? 'Unknown';
					const gpuNodeName = gpuInfo?.nodeName ?? nodeName;
					const gpuIndex = gpuInfo?.device.index ?? 0;
					const memMiB = containerDevice.usedmem;

					middleItems.push({
						id: gpuId,
						type: 'gpu',
						data: {
							label: `GPU ${gpuIndex}`,
							sublabel: `${gpuType}${memMiB > 0 ? ` (${memMiB} MiB)` : ''}`,
							allocated: true
						},
						parentIds: ['ms-0'],
						childIds: [`node-${gpuNodeName}`]
					});
				}
			}

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
			<Sheet.Title>GPU Topology — {msName}</Sheet.Title>
			<Sheet.Description>ModelService → GPU → Node</Sheet.Description>
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

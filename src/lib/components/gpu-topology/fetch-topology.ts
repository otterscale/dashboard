import type { Client } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';

import {
	ANNOTATION_DEVICES_ALLOCATED,
	ANNOTATION_NODE_REGISTER,
	getPodNodeName,
	parseNodeGpuDevices,
	parsePodGpuAllocations
} from './hami';
import type { GpuInfo, NodeInfo, PodInfo, TopologyData } from './types';

type ResourceClient = Client<typeof ResourceService>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAnnotations(obj: any): Record<string, string> {
	return obj?.metadata?.annotations ?? {};
}

export async function fetchModelServiceTopology(
	client: ResourceClient,
	cluster: string,
	namespace: string,
	modelName: string
): Promise<TopologyData> {
	// 1. List pods for this model
	const podResponse = await client.list({
		cluster,
		group: '',
		version: 'v1',
		resource: 'pods',
		namespace,
		labelSelector: `llm-d.ai/model=${modelName}`
	});

	const rawPods = podResponse.items.map((item) => item.object);

	// 2. Parse pod allocations and collect unique node names
	const nodeNames = new Set<string>();
	const pods: PodInfo[] = [];

	for (const pod of rawPods) {
		const annotations = getAnnotations(pod);
		const nodeName = getPodNodeName(pod);
		if (nodeName) nodeNames.add(nodeName);

		pods.push({
			name: (pod as Record<string, any>)?.metadata?.name ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			namespace: (pod as Record<string, any>)?.metadata?.namespace ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			nodeName,
			allocations: parsePodGpuAllocations(annotations[ANNOTATION_DEVICES_ALLOCATED]),
			status: (pod as Record<string, any>)?.status?.phase ?? 'Unknown' // eslint-disable-line @typescript-eslint/no-explicit-any
		});
	}

	// 3. Fetch nodes in parallel
	const nodeEntries = await Promise.all(
		[...nodeNames].map(async (name) => {
			try {
				const res = await client.get({
					cluster,
					group: '',
					version: 'v1',
					resource: 'nodes',
					namespace: '',
					name
				});
				return { name, obj: res.object };
			} catch {
				console.warn(`Failed to fetch node ${name}`);
				return { name, obj: null };
			}
		})
	);

	// 4. Parse GPU devices from nodes
	const nodes: NodeInfo[] = [];
	const gpus: GpuInfo[] = [];

	for (const entry of nodeEntries) {
		if (!entry.obj) continue;
		const annotations = getAnnotations(entry.obj);
		const devices = parseNodeGpuDevices(annotations[ANNOTATION_NODE_REGISTER]);
		nodes.push({ name: entry.name, devices });

		for (const device of devices) {
			gpus.push({
				device,
				nodeName: entry.name,
				allocatedBy: []
			});
		}
	}

	// 5. Cross-reference: find which pods use which GPUs
	crossReferencePodGpus(pods, gpus);

	return {
		modelService: { name: modelName, namespace },
		pods,
		gpus,
		nodes
	};
}

export async function fetchNodeTopology(
	client: ResourceClient,
	cluster: string,
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	nodeObject: any
): Promise<TopologyData> {
	const nodeName: string = nodeObject?.metadata?.name ?? '';
	const annotations = getAnnotations(nodeObject);

	// 1. Parse GPU devices from node
	const devices = parseNodeGpuDevices(annotations[ANNOTATION_NODE_REGISTER]);
	const nodes: NodeInfo[] = [{ name: nodeName, devices }];
	const gpus: GpuInfo[] = devices.map((device) => ({
		device,
		nodeName,
		allocatedBy: []
	}));

	// 2. List pods on this node
	const podResponse = await client.list({
		cluster,
		group: '',
		version: 'v1',
		resource: 'pods',
		namespace: '',
		fieldSelector: `spec.nodeName=${nodeName}`
	});

	// 3. Filter to pods with GPU allocations
	const pods: PodInfo[] = [];
	for (const item of podResponse.items) {
		const pod = item.object;
		const podAnnotations = getAnnotations(pod);
		if (!podAnnotations[ANNOTATION_DEVICES_ALLOCATED]) continue;

		pods.push({
			name: (pod as Record<string, any>)?.metadata?.name ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			namespace: (pod as Record<string, any>)?.metadata?.namespace ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			nodeName,
			allocations: parsePodGpuAllocations(podAnnotations[ANNOTATION_DEVICES_ALLOCATED]),
			status: (pod as Record<string, any>)?.status?.phase ?? 'Unknown' // eslint-disable-line @typescript-eslint/no-explicit-any
		});
	}

	// 4. Cross-reference
	crossReferencePodGpus(pods, gpus);

	return { pods, gpus, nodes };
}

function crossReferencePodGpus(pods: PodInfo[], gpus: GpuInfo[]): void {
	const gpuMap = new Map(gpus.map((g) => [g.device.id, g]));

	for (const pod of pods) {
		for (const alloc of pod.allocations) {
			const gpu = gpuMap.get(alloc.uuid);
			if (gpu) {
				gpu.allocatedBy.push({
					podName: pod.name,
					podNamespace: pod.namespace,
					usedCores: alloc.usedCores,
					usedMem: alloc.usedMem
				});
			}
		}
	}
}

import type { Client } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';

import {
	ANNOTATION_DEVICES_ALLOCATED,
	ANNOTATION_NODE_REGISTER,
	getPodNodeName,
	getPodStatus,
	isPodMigMode,
	isPodTerminated,
	parseNodeGpuDevices,
	parsePodGpuAllocations
} from './hami';
import type { GpuInfo, NodeInfo, PodInfo, PodPvc, TopologyData } from './types';

type ResourceClient = Client<typeof ResourceService>;

// Labels set by kserve on pods owned by an LLMInferenceService.
// See pkg/constants in kserve: KubernetesAppNameLabelKey / KubernetesPartOfLabelKey / LLMDRoleLabelKey.
const LABEL_APP_NAME = 'app.kubernetes.io/name';
const LABEL_PART_OF = 'app.kubernetes.io/part-of';
const LABEL_ROLE = 'llm-d.ai/role';
const PART_OF_VALUE = 'llminferenceservice';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAnnotations(obj: any): Record<string, string> {
	return obj?.metadata?.annotations ?? {};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLabels(obj: any): Record<string, string> {
	return obj?.metadata?.labels ?? {};
}

// KV-cache offload volumes injected by kserve's LLMInferenceService controller
// (attachKVCacheSecondaryTiers): one `kv-cache-secondary-<i>` volume per
// secondary tier in the spec.
const KV_CACHE_VOLUME_NAME = /^kv-cache-secondary-\d+$/;

/**
 * PVCs backing a pod's SSD KV-cache offload tiers. Only `kv-cache-secondary-*`
 * volumes count — other PVC mounts (e.g. kserve's model-store) are not offload
 * storage. A tier is either a generic ephemeral volume (the PVC is created as
 * `<pod>-<volume>`, size from the claim template) or a direct PVC reference
 * (size resolved later). emptyDir tiers have no PVC and are skipped.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getPodKvCachePvcs(pod: any): PodPvc[] {
	const podName: string = pod?.metadata?.name ?? '';
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const volumes: any[] = pod?.spec?.volumes ?? [];
	const pvcs: PodPvc[] = [];
	for (const volume of volumes) {
		if (!KV_CACHE_VOLUME_NAME.test(String(volume?.name ?? ''))) continue;

		const claimName = volume?.persistentVolumeClaim?.claimName;
		if (typeof claimName === 'string' && claimName.length > 0) {
			pvcs.push({ name: claimName, size: '' });
			continue;
		}

		const template = volume?.ephemeral?.volumeClaimTemplate;
		if (template) {
			pvcs.push({
				name: `${podName}-${volume.name}`,
				size: String(template?.spec?.resources?.requests?.storage ?? '')
			});
		}
	}
	return pvcs;
}

/**
 * Fill in each pod PVC's size by listing PersistentVolumeClaims in the
 * involved namespaces. Prefers the bound capacity over the requested size.
 */
async function attachPvcSizes(
	client: ResourceClient,
	cluster: string,
	pods: PodInfo[]
): Promise<void> {
	const namespaces = new Set(pods.filter((p) => p.pvcs.length > 0).map((p) => p.namespace));
	if (namespaces.size === 0) return;

	const sizeByKey = new Map<string, string>();
	await Promise.all(
		[...namespaces].map(async (namespace) => {
			try {
				const res = await client.list({
					cluster,
					group: '',
					version: 'v1',
					resource: 'persistentvolumeclaims',
					namespace
				});
				for (const item of res.items) {
					const obj = item.object as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
					const size =
						obj?.status?.capacity?.storage ?? obj?.spec?.resources?.requests?.storage ?? '';
					sizeByKey.set(`${namespace}/${obj?.metadata?.name ?? ''}`, String(size));
				}
			} catch {
				console.warn(`Failed to list PVCs in namespace ${namespace}`);
			}
		})
	);

	for (const pod of pods) {
		for (const pvc of pod.pvcs) {
			// Keep the claim-template size when the PVC lookup finds nothing
			// (e.g. an ephemeral PVC not yet created, or the listing failed).
			pvc.size = sizeByKey.get(`${pod.namespace}/${pvc.name}`) || pvc.size;
		}
	}
}

export async function fetchLLMInferenceServiceTopology(
	client: ResourceClient,
	cluster: string,
	namespace: string,
	serviceName: string
): Promise<TopologyData> {
	// 1. List pods belonging to this LLMInferenceService (covers both decode and prefill workloads)
	const podResponse = await client.list({
		cluster,
		group: '',
		version: 'v1',
		resource: 'pods',
		namespace,
		labelSelector: `${LABEL_APP_NAME}=${serviceName},${LABEL_PART_OF}=${PART_OF_VALUE}`
	});

	const rawPods = podResponse.items.map((item) => item.object);

	// 2. Parse pod allocations and collect unique node names
	const nodeNames = new Set<string>();
	const pods: PodInfo[] = [];
	// Service pods still holding their GPU allocations. Terminated pods
	// (Succeeded/Failed) keep the allocation annotation but HAMi has already
	// released their devices, so they render in the diagram (with status) but
	// must not count toward GPU usage or MIG slices.
	const activeServicePods: PodInfo[] = [];

	for (const pod of rawPods) {
		const annotations = getAnnotations(pod);
		const labels = getLabels(pod);
		const nodeName = getPodNodeName(pod);
		const allocations = parsePodGpuAllocations(annotations[ANNOTATION_DEVICES_ALLOCATED]);
		if (nodeName && allocations.length > 0) nodeNames.add(nodeName);

		const podInfo: PodInfo = {
			name: (pod as Record<string, any>)?.metadata?.name ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			namespace: (pod as Record<string, any>)?.metadata?.namespace ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			nodeName,
			allocations,
			status: getPodStatus(pod),
			role: labels[LABEL_ROLE],
			isMig: isPodMigMode(pod),
			pvcs: getPodKvCachePvcs(pod)
		};
		pods.push(podInfo);
		if (!isPodTerminated(pod)) activeServicePods.push(podInfo);
	}

	// 3. Fetch nodes in parallel (fresh GET to ensure full annotations)
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

	// 5. List every GPU pod on the involved nodes (all namespaces), so GPU/node
	// usage reflects all workloads — not just this service's pods. The diagram
	// still only renders this service's pods; other pods only contribute usage.
	const nodePodLists = await Promise.all(
		[...nodeNames].map(async (name) => {
			try {
				const res = await client.list({
					cluster,
					group: '',
					version: 'v1',
					resource: 'pods',
					namespace: '',
					fieldSelector: `spec.nodeName=${name}`
				});
				return res.items.map((item) => item.object);
			} catch {
				console.warn(`Failed to list pods on node ${name}`);
				return [];
			}
		})
	);

	// Start from this service's active pods so their allocations survive a failed
	// node listing, then add the other running GPU pods (dedup by namespace/name).
	const seen = new Set(pods.map((p) => `${p.namespace}/${p.name}`));
	const allocationPods: PodInfo[] = [...activeServicePods];
	for (const pod of nodePodLists.flat()) {
		const podAnnotations = getAnnotations(pod);
		if (!podAnnotations[ANNOTATION_DEVICES_ALLOCATED]) continue;
		if (isPodTerminated(pod)) continue;

		const meta = (pod as Record<string, any>)?.metadata; // eslint-disable-line @typescript-eslint/no-explicit-any
		const key = `${meta?.namespace ?? ''}/${meta?.name ?? ''}`;
		if (seen.has(key)) continue;
		seen.add(key);

		allocationPods.push({
			name: meta?.name ?? '',
			namespace: meta?.namespace ?? '',
			nodeName: getPodNodeName(pod),
			allocations: parsePodGpuAllocations(podAnnotations[ANNOTATION_DEVICES_ALLOCATED]),
			status: getPodStatus(pod),
			role: getLabels(pod)[LABEL_ROLE],
			isMig: isPodMigMode(pod),
			pvcs: getPodKvCachePvcs(pod)
		});
	}

	// 6. Cross-reference: find which pods use which GPUs
	crossReferencePodGpus(allocationPods, gpus);

	// 7. Resolve PVC sizes for the pods rendered in the diagram
	await attachPvcSizes(client, cluster, pods);

	return {
		llmInferenceService: { name: serviceName, namespace },
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

	// Fetch node fresh to ensure we have full annotations
	let fullNodeObj = nodeObject;
	try {
		const res = await client.get({
			cluster,
			group: '',
			version: 'v1',
			resource: 'nodes',
			namespace: '',
			name: nodeName
		});
		fullNodeObj = res.object;
	} catch {
		console.warn(`Failed to fetch node ${nodeName}, using list object`);
	}

	const annotations = getAnnotations(fullNodeObj);

	// 1. Parse GPU devices from node
	const devices = parseNodeGpuDevices(annotations[ANNOTATION_NODE_REGISTER]);
	const nodes: NodeInfo[] = [{ name: nodeName, devices }];
	const gpus: GpuInfo[] = devices.map((device) => ({
		device,
		nodeName,
		allocatedBy: []
	}));

	// 2. List all pods on this node (across all namespaces)
	const podResponse = await client.list({
		cluster,
		group: '',
		version: 'v1',
		resource: 'pods',
		namespace: '',
		fieldSelector: `spec.nodeName=${nodeName}`
	});

	// 3. Filter to pods still holding GPU allocations. Terminated pods keep the
	// annotation but no longer occupy devices, so they are excluded entirely
	// from the node view.
	const pods: PodInfo[] = [];
	for (const item of podResponse.items) {
		const pod = item.object;
		const podAnnotations = getAnnotations(pod);
		if (!podAnnotations[ANNOTATION_DEVICES_ALLOCATED]) continue;
		if (isPodTerminated(pod)) continue;

		const labels = getLabels(pod);
		pods.push({
			name: (pod as Record<string, any>)?.metadata?.name ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			namespace: (pod as Record<string, any>)?.metadata?.namespace ?? '', // eslint-disable-line @typescript-eslint/no-explicit-any
			nodeName,
			allocations: parsePodGpuAllocations(podAnnotations[ANNOTATION_DEVICES_ALLOCATED]),
			status: getPodStatus(pod),
			role: labels[LABEL_ROLE],
			isMig: isPodMigMode(pod),
			pvcs: getPodKvCachePvcs(pod)
		});
	}

	// 4. Cross-reference
	crossReferencePodGpus(pods, gpus);

	// 5. Resolve PVC sizes for the pods rendered in the diagram
	await attachPvcSizes(client, cluster, pods);

	return { pods, gpus, nodes };
}

export async function fetchAllGpuNodes(
	client: ResourceClient,
	cluster: string
): Promise<NodeInfo[]> {
	const response = await client.list({
		cluster,
		group: '',
		version: 'v1',
		resource: 'nodes',
		namespace: ''
	});

	const nodes: NodeInfo[] = [];
	for (const item of response.items) {
		const obj = item.object as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
		const annotations = getAnnotations(obj);
		const registerAnnotation = annotations[ANNOTATION_NODE_REGISTER];
		if (!registerAnnotation) continue;

		const devices = parseNodeGpuDevices(registerAnnotation);
		if (devices.length > 0) {
			nodes.push({
				name: obj?.metadata?.name ?? '',
				devices
			});
		}
	}
	return nodes;
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

import type { Client } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';

type ResourceClient = Client<typeof ResourceService>;

export interface GpuFetchResult {
	resources: string[];
	quantities: Map<string, number>;
}

const GPU_PASSTHROUGH_LABELS = {
	'nvidia.com/gpu.workload.config': 'vm-passthrough',
	'nvidia.com/gpu.present': 'true'
};

export async function fetchNodesWithVmxLabel(
	resourceClient: ResourceClient,
	cluster: string
): Promise<any[]> {
	try {
		const response = await resourceClient.list({
			cluster,
			group: '',
			version: 'v1',
			resource: 'nodes'
		});
		return response.items.filter((item: any) => {
			const nodeLabels = (item.object as any)?.metadata?.labels ?? {};
			return nodeLabels['cpu-feature.node.kubevirt.io/vmx'] === 'true';
		});
	} catch (error) {
		console.error('Error fetching nodes with VMX label:', error);
		return [];
	}
}

export async function fetchNodesWithGpuPassthrough(
	resourceClient: ResourceClient,
	cluster: string
): Promise<any[]> {
	try {
		const response = await resourceClient.list({
			cluster,
			group: '',
			version: 'v1',
			resource: 'nodes'
		});
		return response.items.filter((item: any) => {
			const nodeLabels = (item.object as any)?.metadata?.labels ?? {};
			return Object.entries(GPU_PASSTHROUGH_LABELS).every(
				([key, value]) => nodeLabels[key] === value
			);
		});
	} catch (error) {
		console.error('Error fetching nodes with GPU passthrough:', error);
		return [];
	}
}

export async function fetchAllGpuResources(
	resourceClient: ResourceClient,
	cluster: string
): Promise<GpuFetchResult> {
	try {
		const nodes = await fetchNodesWithGpuPassthrough(resourceClient, cluster);
		const gpuResources = new Set<string>();
		const quantities = new Map<string, number>();

		for (const nodeItem of nodes) {
			const allocatable = (nodeItem.object as any)?.status?.allocatable ?? {};
			Object.keys(allocatable).forEach((resourceKey) => {
				if (
					resourceKey.startsWith('nvidia.com/') &&
					!resourceKey.endsWith('vgpu') &&
					!resourceKey.includes('/vgpu') &&
					parseInt(allocatable[resourceKey]) > 0
				) {
					gpuResources.add(resourceKey);
					const quantity = parseInt(allocatable[resourceKey]) || 0;
					const currentMax = quantities.get(resourceKey) || 0;
					if (quantity > currentMax) {
						quantities.set(resourceKey, quantity);
					}
				}
			});
		}

		return { resources: Array.from(gpuResources), quantities };
	} catch (error) {
		console.error('Error fetching all GPU resources:', error);
		return { resources: [], quantities: new Map() };
	}
}

export async function fetchGpuResourcesForNode(
	resourceClient: ResourceClient,
	cluster: string,
	nodeName: string
): Promise<GpuFetchResult> {
	if (!nodeName || typeof nodeName !== 'string') return { resources: [], quantities: new Map() };
	try {
		const response = await resourceClient.get({
			cluster,
			group: '',
			version: 'v1',
			resource: 'nodes',
			name: nodeName
		});

		const nodeObj = response.object as any;
		const nodeLabels = nodeObj?.metadata?.labels ?? {};
		const hasGpuWorkloadConfig = nodeLabels['nvidia.com/gpu.workload.config'] === 'vm-passthrough';
		const hasGpuPresent = nodeLabels['nvidia.com/gpu.present'] === 'true';

		if (!hasGpuWorkloadConfig || !hasGpuPresent) {
			console.warn(`Node ${nodeName} does not have both required GPU labels`);
			return { resources: [], quantities: new Map() };
		}

		const allocatable = nodeObj?.status?.allocatable ?? {};
		const gpuResources: string[] = [];
		const quantities = new Map<string, number>();

		Object.keys(allocatable).forEach((resourceKey) => {
			if (
				resourceKey.startsWith('nvidia.com/') &&
				!resourceKey.endsWith('vgpu') &&
				!resourceKey.includes('/vgpu') &&
				parseInt(allocatable[resourceKey]) > 0
			) {
				gpuResources.push(resourceKey);
				quantities.set(resourceKey, parseInt(allocatable[resourceKey]) || 0);
			}
		});

		return { resources: gpuResources, quantities };
	} catch (error) {
		console.error(`Error fetching GPU resources for node ${nodeName}:`, error);
		return { resources: [], quantities: new Map() };
	}
}

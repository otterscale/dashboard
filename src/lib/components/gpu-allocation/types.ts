export interface GpuDevice {
	id: string;
	index: number;
	count: number;
	devcore: number;
	devmem: number; // MiB
	type: string;
	health: boolean;
}

export interface GpuAllocation {
	uuid: string;
	usedCores: number;
	usedMem: number; // MiB
}

export interface PodInfo {
	name: string;
	namespace: string;
	nodeName: string;
	allocations: GpuAllocation[];
	status: string;
}

export interface GpuInfo {
	device: GpuDevice;
	nodeName: string;
	allocatedBy: { podName: string; podNamespace: string; usedCores: number; usedMem: number }[];
}

export interface NodeInfo {
	name: string;
	devices: GpuDevice[];
}

export interface TopologyData {
	modelService?: { name: string; namespace: string };
	pods: PodInfo[];
	gpus: GpuInfo[];
	nodes: NodeInfo[];
}

export type TopologyView = 'model-service' | 'node';

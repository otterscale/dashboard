export interface GpuDevice {
	id: string;
	index: number;
	count: number;
	devcore: number;
	devmem: number; // MiB
	type: string;
	mode: string; // hami.io device mode reported in node-nvidia-register, e.g. "mig" | "hami-core" | ""
	health: boolean;
}

/** A MIG partition inferred from a pod allocation on a MIG-mode GPU. */
export interface MigSlice {
	profile: string; // e.g. "1g.18gb"
	gCount: number; // compute-slice count (1, 2, 3, 4, 7)
	usedMem: number; // MiB
	usedCores: number;
	podName: string;
	podNamespace: string;
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
	role?: string; // llm-d.ai/role: decode | prefill | both
	isMig: boolean; // nvidia.com/vgpu-mode: mig
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
	llmInferenceService?: { name: string; namespace: string };
	pods: PodInfo[];
	gpus: GpuInfo[];
	nodes: NodeInfo[];
}

export type TopologyView = 'llm-inference-service' | 'node';

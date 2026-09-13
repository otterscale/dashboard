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

/** A PVC backing an SSD KV-cache offload tier of a pod. */
export interface PodPvc {
	name: string; // actual PVC name (for ephemeral volumes: `<pod>-<volume>`)
	size: string; // k8s quantity, e.g. "50Gi"; bound capacity, or the claim template request as fallback
}

export interface PodInfo {
	name: string;
	namespace: string;
	workspace?: string; // OtterScale workspace owning the pod's namespace
	nodeName: string;
	allocations: GpuAllocation[];
	status: string;
	role?: string; // llm-d.ai/role: decode | prefill | both
	isMig: boolean; // nvidia.com/vgpu-mode: mig
	pvcs: PodPvc[];
}

/**
 * Live per-card telemetry from the DCGM exporter, keyed by GPU UUID. Every field is
 * optional: DCGM is a separate exporter from HAMi, so a card registered by HAMi may
 * have no measurements at all (no GPU Operator, Prometheus unreachable, metric absent).
 * Fields are never attributable to a pod — DCGM measures the whole card.
 */
export interface GpuUtilization {
	/** Compute (SM) utilization, 0-100. */
	compute?: number;
	/** Frame buffer in use by workloads, MiB. Excludes the driver's reserved buffer. */
	usedMem?: number;
	/** Physical frame buffer of the card, MiB — HAMi's `devmem` is the scheduler's pool. */
	totalMem?: number;
}

export interface GpuInfo {
	device: GpuDevice;
	nodeName: string;
	allocatedBy: { podName: string; podNamespace: string; usedCores: number; usedMem: number }[];
	/** Measured usage of the card; absent when DCGM reports nothing for it. */
	utilization?: GpuUtilization;
}

export interface NodeInfo {
	name: string;
	devices: GpuDevice[];
}

export interface TopologyData {
	llmInferenceService?: { name: string; namespace: string; workspace?: string };
	pods: PodInfo[];
	gpus: GpuInfo[];
	nodes: NodeInfo[];
}

export type TopologyView = 'llm-inference-service' | 'node';

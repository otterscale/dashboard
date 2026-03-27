import type { Edge, Node } from '@xyflow/svelte';

// --- HAMi annotation keys ---
export const HAMI_NODE_NVIDIA_REGISTER = 'hami.io/node-nvidia-register';
export const HAMI_VGPU_DEVICES_ALLOCATED = 'hami.io/vgpu-devices-allocated';
export const HAMI_VGPU_NODE = 'hami.io/vgpu-node';
export const HAMI_BIND_PHASE = 'hami.io/bind-phase';

// HAMi encoding separators
const DEVICE_SPLIT = ':';
const CONTAINER_SPLIT = ';';

// --- HAMi decoded types ---

export interface HamiDeviceInfo {
	id: string;
	index: number;
	count: number;
	devmem: number; // MiB
	devcore: number;
	type: string;
	numa: number;
	health: boolean;
	mode: string;
}

export interface HamiContainerDevice {
	uuid: string;
	type: string;
	usedmem: number; // MiB
	usedcores: number;
}

// --- HAMi decoders (mirrors HAMi Go pkg/device) ---

/**
 * Decode node annotation `hami.io/node-nvidia-register`.
 * Format per device: `UUID,count,devmem,devcore,type,numa,health[,index,mode]`
 * Devices separated by `:`.
 */
export function decodeNodeDevices(str: string): HamiDeviceInfo[] {
	if (!str || !str.includes(DEVICE_SPLIT)) return [];

	const segments = str.split(DEVICE_SPLIT).filter((s) => s.includes(','));
	const devices: HamiDeviceInfo[] = [];

	for (const seg of segments) {
		const items = seg.split(',');
		if (items.length !== 7 && items.length !== 9) continue;

		const device: HamiDeviceInfo = {
			id: items[0],
			count: parseInt(items[1], 10) || 0,
			devmem: parseInt(items[2], 10) || 0,
			devcore: parseInt(items[3], 10) || 0,
			type: items[4],
			numa: parseInt(items[5], 10) || 0,
			health: items[6] === 'true',
			index: items.length === 9 ? parseInt(items[7], 10) || 0 : 0,
			mode: items.length === 9 ? items[8] : 'hami-core'
		};
		devices.push(device);
	}

	return devices;
}

/**
 * Decode container devices from a single container segment.
 * Format per device: `UUID,type,usedmem,usedcores`
 * Devices separated by `:`.
 */
export function decodeContainerDevices(str: string): HamiContainerDevice[] {
	if (!str) return [];

	const segments = str.split(DEVICE_SPLIT).filter((s) => s.includes(','));
	const devices: HamiContainerDevice[] = [];

	for (const seg of segments) {
		const parts = seg.split(',');
		if (parts.length < 4) continue;

		devices.push({
			uuid: parts[0],
			type: parts[1],
			usedmem: parseInt(parts[2], 10) || 0,
			usedcores: parseInt(parts[3], 10) || 0
		});
	}

	return devices;
}

/**
 * Decode pod annotation `hami.io/vgpu-devices-allocated`.
 * Containers separated by `;`, devices within a container by `:`.
 * Returns flat list of all container devices for this pod.
 */
export function decodePodDevices(annotation: string): HamiContainerDevice[] {
	if (!annotation) return [];

	const containers = annotation.split(CONTAINER_SPLIT);
	const allDevices: HamiContainerDevice[] = [];

	for (const containerStr of containers) {
		const devices = decodeContainerDevices(containerStr);
		allDevices.push(...devices);
	}

	return allDevices;
}

// --- GPU resource constants ---

export const GPU_RESOURCE_MAP: Record<string, string> = {
	nvidia: 'nvidia.com/gpu',
	amd: 'amd.com/gpu',
	'intel-gaudi': 'habana.ai/gaudi',
	google: 'google.com/tpu'
};

export const GPU_RESOURCE_KEYS = Object.values(GPU_RESOURCE_MAP);

// --- xyflow node types ---

export interface GpuTopologyNodeData {
	label: string;
	sublabel?: string;
	status?: string;
	count?: number;
	allocated?: boolean;
	[key: string]: unknown;
}

export type GpuTopologyNode = Node<GpuTopologyNodeData>;
export type GpuTopologyEdge = Edge;

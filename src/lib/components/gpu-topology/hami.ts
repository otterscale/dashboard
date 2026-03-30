import type { GpuAllocation, GpuDevice } from './types';

const ANNOTATION_NODE_REGISTER = 'hami.io/node-nvidia-register';
const ANNOTATION_VGPU_NODE = 'hami.io/vgpu-node';
const ANNOTATION_DEVICES_ALLOCATED = 'hami.io/vgpu-devices-allocated';

export { ANNOTATION_DEVICES_ALLOCATED, ANNOTATION_NODE_REGISTER, ANNOTATION_VGPU_NODE };

export function parseNodeGpuDevices(annotationValue: string | undefined): GpuDevice[] {
	if (!annotationValue) return [];
	try {
		const raw = JSON.parse(annotationValue);
		if (!Array.isArray(raw)) return [];
		return raw.map((d: Record<string, unknown>) => ({
			id: String(d.ID ?? d.id ?? ''),
			index: Number(d.Index ?? d.index ?? 0),
			count: Number(d.Count ?? d.count ?? 0),
			devcore: Number(d.Devcore ?? d.devcore ?? 0),
			devmem: Number(d.Devmem ?? d.devmem ?? 0),
			type: String(d.Type ?? d.type ?? ''),
			health: Boolean(d.Health ?? d.health ?? false)
		}));
	} catch (e) {
		console.warn('Failed to parse node GPU devices annotation:', e);
		return [];
	}
}

export function parsePodGpuAllocations(annotationValue: string | undefined): GpuAllocation[] {
	if (!annotationValue) return [];
	try {
		const raw = JSON.parse(annotationValue);
		const allocations: GpuAllocation[] = [];

		// The structure can be nested: { "nvidia": { "<containerName>": [devices...] } }
		// or a flat array of devices. Handle both.
		if (Array.isArray(raw)) {
			for (const d of raw) {
				allocations.push(parseDevice(d));
			}
		} else if (typeof raw === 'object' && raw !== null) {
			// Nested structure: iterate through device types and containers
			for (const deviceType of Object.values(raw)) {
				if (typeof deviceType === 'object' && deviceType !== null && !Array.isArray(deviceType)) {
					for (const containers of Object.values(
						deviceType as Record<string, unknown>
					)) {
						if (Array.isArray(containers)) {
							for (const d of containers) {
								allocations.push(parseDevice(d));
							}
						}
					}
				} else if (Array.isArray(deviceType)) {
					for (const d of deviceType) {
						allocations.push(parseDevice(d));
					}
				}
			}
		}

		return allocations.filter((a) => a.uuid);
	} catch (e) {
		console.warn('Failed to parse pod GPU allocations annotation:', e);
		return [];
	}
}

function parseDevice(d: Record<string, unknown>): GpuAllocation {
	return {
		uuid: String(d.UUID ?? d.uuid ?? d.Id ?? d.id ?? ''),
		usedCores: Number(d.Usedcores ?? d.usedcores ?? d.UsedCores ?? 0),
		usedMem: Number(d.Usedmem ?? d.usedmem ?? d.UsedMem ?? 0)
	};
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPodNodeName(pod: any): string {
	return (
		pod?.metadata?.annotations?.[ANNOTATION_VGPU_NODE] ?? pod?.spec?.nodeName ?? ''
	);
}

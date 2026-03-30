import type { GpuAllocation, GpuDevice } from './types';

const ANNOTATION_NODE_REGISTER = 'hami.io/node-nvidia-register';
const ANNOTATION_VGPU_NODE = 'hami.io/vgpu-node';
const ANNOTATION_DEVICES_ALLOCATED = 'hami.io/vgpu-devices-allocated';

export { ANNOTATION_DEVICES_ALLOCATED, ANNOTATION_NODE_REGISTER, ANNOTATION_VGPU_NODE };

/**
 * Parse `hami.io/node-nvidia-register` annotation.
 * Format: JSON array of device objects with lowercase field names.
 * Example: [{"id":"GPU-xxx","index":3,"count":10,"devmem":24564,"devcore":100,"type":"NVIDIA GeForce RTX 4090","health":true,...}]
 */
export function parseNodeGpuDevices(annotationValue: string | undefined): GpuDevice[] {
	if (!annotationValue) return [];
	try {
		const raw = JSON.parse(annotationValue);
		if (!Array.isArray(raw)) return [];
		return raw.map((d: Record<string, unknown>) => ({
			id: String(d.id ?? d.ID ?? ''),
			index: Number(d.index ?? d.Index ?? 0),
			count: Number(d.count ?? d.Count ?? 0),
			devcore: Number(d.devcore ?? d.Devcore ?? 0),
			devmem: Number(d.devmem ?? d.Devmem ?? 0),
			type: String(d.type ?? d.Type ?? ''),
			health: Boolean(d.health ?? d.Health ?? false)
		}));
	} catch (e) {
		console.warn('Failed to parse node GPU devices annotation:', e);
		return [];
	}
}

/**
 * Parse `hami.io/vgpu-devices-allocated` annotation.
 *
 * Format is a custom delimited string (NOT JSON):
 *   - Semicolon (;) separates containers
 *   - Colon (:) separates devices within a container
 *   - Comma (,) separates fields within a device
 *
 * Device fields: UUID,Type,Usedmem,Usedcores
 * Example: "GPU-c15ecdf3-...,NVIDIA,8192,0:GPU-abc...,NVIDIA,4096,50;GPU-def...,NVIDIA,2048,25"
 *
 * Trailing colons/semicolons and empty segments are common and must be tolerated.
 */
export function parsePodGpuAllocations(annotationValue: string | undefined): GpuAllocation[] {
	if (!annotationValue) return [];
	try {
		const allocations: GpuAllocation[] = [];

		// Split by semicolon to get per-container entries
		const containers = annotationValue.split(';');
		for (const container of containers) {
			const trimmed = container.trim();
			if (!trimmed) continue;

			// Split by colon to get individual device entries
			const devices = trimmed.split(':');
			for (const deviceStr of devices) {
				const dt = deviceStr.trim();
				if (!dt) continue;

				// Split by comma to get fields: UUID, Type, Usedmem, Usedcores
				const fields = dt.split(',');
				if (fields.length < 4) continue;

				const uuid = fields[0].trim();
				// fields[1] is the device type (e.g. "NVIDIA"), skip it
				const usedMem = parseInt(fields[2], 10) || 0;
				const usedCores = parseInt(fields[3], 10) || 0;

				if (uuid) {
					allocations.push({ uuid, usedCores, usedMem });
				}
			}
		}

		return allocations;
	} catch (e) {
		console.warn('Failed to parse pod GPU allocations annotation:', e);
		return [];
	}
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPodNodeName(pod: any): string {
	return (
		pod?.metadata?.annotations?.[ANNOTATION_VGPU_NODE] ?? pod?.spec?.nodeName ?? ''
	);
}

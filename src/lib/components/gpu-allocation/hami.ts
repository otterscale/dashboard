import type { GpuAllocation, GpuDevice, MigSlice } from './types';

const ANNOTATION_NODE_REGISTER = 'hami.io/node-nvidia-register';
const ANNOTATION_VGPU_NODE = 'hami.io/vgpu-node';
const ANNOTATION_DEVICES_ALLOCATED = 'hami.io/vgpu-devices-allocated';
const ANNOTATION_VGPU_MODE = 'nvidia.com/vgpu-mode';

export {
	ANNOTATION_DEVICES_ALLOCATED,
	ANNOTATION_NODE_REGISTER,
	ANNOTATION_VGPU_MODE,
	ANNOTATION_VGPU_NODE
};

/**
 * Whether a pod is scheduled onto MIG-backed vGPU.
 * HAMi records this via the `nvidia.com/vgpu-mode: mig` pod annotation.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPodMigMode(pod: any): boolean {
	return pod?.metadata?.annotations?.[ANNOTATION_VGPU_MODE]?.toLowerCase() === 'mig';
}

/**
 * Whether a pod has finished running (Succeeded/Failed). HAMi releases the
 * pod's device allocations at that point, but the allocation annotation stays
 * on the pod object until it is deleted — so terminated pods must not count
 * toward GPU usage or MIG slices.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isPodTerminated(pod: any): boolean {
	const phase = pod?.status?.phase;
	return phase === 'Succeeded' || phase === 'Failed';
}

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
			mode: String(d.mode ?? d.Mode ?? ''),
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

		const GPU_UUID_SLOT_SUFFIX = /\[[^\]]*\]\s*$/;
		/** Strip a trailing slot-index suffix like "GPU-abc123[0]" -> "GPU-abc123" */
		const normalizeGpuUuid = (rawUuid: string): string =>
			rawUuid.trim().replace(GPU_UUID_SLOT_SUFFIX, '');

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

				const uuid = normalizeGpuUuid(fields[0].trim());
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
	return pod?.metadata?.annotations?.[ANNOTATION_VGPU_NODE] ?? pod?.spec?.nodeName ?? '';
}

/**
 * Resolve a pod's effective status the way `kubectl get pods` does, so it
 * reflects reality rather than the coarse `.status.phase`:
 *   - a pod being deleted -> "Terminating"
 *   - init/main container waiting reasons -> "ContainerCreating", "CrashLoopBackOff", "ImagePullBackOff", "Init:..."
 *   - terminated reasons -> "Completed", "Error", "OOMKilled", "ExitCode:N"
 *   - phase is Running but not every container is ready -> "NotReady"
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPodStatus(pod: any): string {
	const podStatus = pod?.status ?? {};
	const phase: string = podStatus.phase ?? 'Unknown';
	const baseReason: string = podStatus.reason ?? '';
	let reason = baseReason || phase;

	// Init containers: a blocking init container's state supersedes the phase.
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const initStatuses: any[] = podStatus.initContainerStatuses ?? [];
	const initTotal = (pod?.spec?.initContainers ?? []).length;
	let initializing = false;
	for (let i = 0; i < initStatuses.length; i += 1) {
		const cs = initStatuses[i];
		if (cs?.state?.running && cs?.ready) continue; // started native sidecar
		const terminated = cs?.state?.terminated;
		const waiting = cs?.state?.waiting;
		if (terminated && terminated.exitCode === 0) continue; // completed init step
		if (terminated) {
			reason = terminated.reason
				? `Init:${terminated.reason}`
				: terminated.signal
					? `Init:Signal:${terminated.signal}`
					: `Init:ExitCode:${terminated.exitCode}`;
			initializing = true;
			break;
		}
		if (waiting && waiting.reason && waiting.reason !== 'PodInitializing') {
			reason = `Init:${waiting.reason}`;
			initializing = true;
			break;
		}
		reason = `Init:${i}/${initTotal}`;
		initializing = true;
		break;
	}

	// Main containers: surface the first problematic container, then readiness.
	if (!initializing) {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const containerStatuses: any[] = podStatus.containerStatuses ?? [];
		const total = containerStatuses.length;
		const readyCount = containerStatuses.filter((cs) => cs?.ready).length;
		for (const cs of containerStatuses) {
			const waiting = cs?.state?.waiting;
			const terminated = cs?.state?.terminated;
			if (waiting && waiting.reason) {
				reason = waiting.reason;
				break;
			}
			if (terminated && terminated.reason && terminated.reason !== 'Completed') {
				reason = terminated.reason;
				break;
			}
			if (terminated && !terminated.reason) {
				reason = terminated.signal
					? `Signal:${terminated.signal}`
					: `ExitCode:${terminated.exitCode}`;
				break;
			}
		}
		if (reason === 'Running' && total > 0 && readyCount < total) {
			reason = 'NotReady';
		}
	}

	// A pod with a deletion timestamp is being torn down regardless of phase.
	if (pod?.metadata?.deletionTimestamp) {
		reason = baseReason === 'NodeLost' ? 'Unknown' : 'Terminating';
	}

	return reason;
}

/**
 * Whether a physical GPU is running in MIG mode.
 * HAMi records this per-device via the `mode` field in `hami.io/node-nvidia-register`.
 * Non-MIG GPUs report other values (e.g. "hami-core") or omit the field, so an
 * exact "mig" match keeps vGPU / passthrough nodes on the normal display path.
 */
export function isGpuMigMode(device: GpuDevice): boolean {
	return device.mode?.toLowerCase() === 'mig';
}

// Compute-slice count keyed by the fraction of full-GPU cores (100 = whole GPU).
// Tuned for the common NVIDIA layout (1g=14, 2g=28, 3g=42, 4g=56, 7g=100) that
// covers A100 / H100 / H200 / B200; other cards may only approximate the g-count.
function inferGpuSliceCount(usedCores: number): number {
	if (usedCores >= 78) return 7;
	if (usedCores >= 49) return 4;
	if (usedCores >= 35) return 3;
	if (usedCores >= 21) return 2;
	return 1;
}

/**
 * Infer the MIG partition a pod allocation occupies from its used memory/cores.
 * HAMi does dynamic MIG (instances are created on allocation), so the set of
 * allocations on a MIG-mode GPU is the set of active MIG instances.
 * Example: 18432 MiB / 14 cores -> "1g.18gb".
 */
export function inferMigProfile(
	usedMem: number,
	usedCores: number
): { profile: string; gCount: number } {
	const gCount = inferGpuSliceCount(usedCores);
	const memGb = Math.max(1, Math.round(usedMem / 1024));
	return { profile: `${gCount}g.${memGb}gb`, gCount };
}

/** Build the active MIG slices of a GPU from the pod allocations occupying it. */
export function buildMigSlices(
	allocatedBy: { podName: string; podNamespace: string; usedCores: number; usedMem: number }[]
): MigSlice[] {
	// Skip zero-value entries (malformed or fallback-parsed annotations) — they
	// carry no slice information and would render a bogus "1g.1gb" chip.
	return allocatedBy
		.filter((a) => a.usedMem > 0 || a.usedCores > 0)
		.map((a) => {
			const { profile, gCount } = inferMigProfile(a.usedMem, a.usedCores);
			return {
				profile,
				gCount,
				usedMem: a.usedMem,
				usedCores: a.usedCores,
				podName: a.podName,
				podNamespace: a.podNamespace
			};
		});
}

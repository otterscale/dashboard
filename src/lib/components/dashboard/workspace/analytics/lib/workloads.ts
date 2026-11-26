import { MIB } from '$lib/components/dashboard/kit/format';
import { parseHamiAllocation } from '$lib/components/dashboard/model/analytics/lib/pods';

import { listWorkspaceObjects, type ResourceClient } from '../../lib/resources';
import { classifyWorkloadMembers, type WorkloadMembers } from '../../overview/workload-status';
import type { GpuDevice } from './model';

type AnnotatedPod = {
	metadata?: { name?: string; annotations?: Record<string, string> };
	status?: { phase?: string };
};

/** What the HAMi scheduler booked for each pod that still holds its booking, from its annotation. */
export function gpuAllocations(pods: AnnotatedPod[]): Map<string, GpuDevice[]> {
	const out = new Map<string, GpuDevice[]>();
	for (const pod of pods) {
		const name = pod.metadata?.name;
		if (!name) continue;
		if (pod.status?.phase !== 'Pending' && pod.status?.phase !== 'Running') continue;
		const devices = parseHamiAllocation(
			pod.metadata?.annotations?.['hami.io/vgpu-devices-allocated']
		).map((device) => ({ uuid: device.uuid, bytes: device.mib * MIB }));
		if (devices.length > 0) out.set(name, devices);
	}
	return out;
}

export type WorkspaceWorkloads = {
	workloads: WorkloadMembers[];
	/** GPU bookings per pod. */
	gpu: Map<string, GpuDevice[]>;
};

/**
 * The workspace's workloads with their pods: the same five lists, and the same attribution, as
 * the overview's Workload health card, so both pages name the same workloads.
 */
export async function listWorkloads(
	client: ResourceClient,
	cluster: string,
	namespace: string
): Promise<WorkspaceWorkloads> {
	const objects = await listWorkspaceObjects(client, cluster, namespace);
	return {
		workloads: classifyWorkloadMembers(objects, Date.now()),
		gpu: gpuAllocations(objects.pods as AnnotatedPod[])
	};
}

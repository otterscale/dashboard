import type { Client } from '@connectrpc/connect';
import { type ListRequest, type ListResponse, ResourceService } from '@otterscale/api/resource/v1';

import { parseHamiAllocation } from '$lib/components/dashboard/model/analytics/lib/pods';
import { WorkspaceReleaseLabelSelector } from '$lib/utils/helm-release';

import {
	DEPLOYMENT,
	HELM_RELEASE,
	LLM_INFERENCE_SERVICE,
	POD,
	type ResourceKind,
	STATEFUL_SET
} from '../../overview/links';
import {
	classifyWorkloadMembers,
	type WorkloadMembers,
	type WorkspaceObjects
} from '../../overview/workload-status';
import type { GpuDevice } from './model';

type ResourceClient = Client<typeof ResourceService>;

async function listAll(
	client: ResourceClient,
	cluster: string,
	namespace: string,
	kind: ResourceKind,
	labelSelector?: string
): Promise<unknown[]> {
	const out: unknown[] = [];
	let continueToken: string | undefined = undefined;
	for (;;) {
		const response: ListResponse = await client.list({
			cluster,
			namespace,
			group: kind.group,
			version: kind.version,
			resource: kind.resource,
			labelSelector,
			limit: BigInt(500),
			continue: continueToken
		} as ListRequest);
		out.push(...response.items.map((item) => item.object));
		continueToken = response.continue || undefined;
		if (!continueToken) break;
	}
	return out;
}

const MIB = 1024 ** 2;

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
	const [models, releases, deployments, statefulSets, pods] = await Promise.all([
		listAll(client, cluster, namespace, LLM_INFERENCE_SERVICE),
		listAll(client, cluster, namespace, HELM_RELEASE, WorkspaceReleaseLabelSelector),
		listAll(client, cluster, namespace, DEPLOYMENT),
		listAll(client, cluster, namespace, STATEFUL_SET),
		listAll(client, cluster, namespace, POD)
	]);
	return {
		workloads: classifyWorkloadMembers(
			{ models, releases, deployments, statefulSets, pods } as WorkspaceObjects,
			Date.now()
		),
		gpu: gpuAllocations(pods as AnnotatedPod[])
	};
}

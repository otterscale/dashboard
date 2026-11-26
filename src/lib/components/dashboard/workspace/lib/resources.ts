import type { Client } from '@connectrpc/connect';
import { type ListRequest, type ListResponse, ResourceService } from '@otterscale/api/resource/v1';

import { WorkspaceReleaseLabelSelector } from '$lib/utils/helm-release';

import {
	DEPLOYMENT,
	HELM_RELEASE,
	LLM_INFERENCE_SERVICE,
	POD,
	type ResourceKind,
	STATEFUL_SET
} from '../overview/links';
import type { WorkspaceObjects } from '../overview/workload-status';

// The Workspace dashboard's reads of the Resource API, shared by the overview cards and Analytics
// so both list the same objects the same way.

export type ResourceClient = Client<typeof ResourceService>;

/** Every object of a kind in the namespace, following the list's `continue` token to the end. */
export async function listAll(
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

/** The five lists a workspace's workloads are read from. */
export async function listWorkspaceObjects(
	client: ResourceClient,
	cluster: string,
	namespace: string
): Promise<WorkspaceObjects> {
	const [models, releases, deployments, statefulSets, pods] = await Promise.all([
		listAll(client, cluster, namespace, LLM_INFERENCE_SERVICE),
		// The workspace's own releases, as the sidebar's Release page lists them.
		listAll(client, cluster, namespace, HELM_RELEASE, WorkspaceReleaseLabelSelector),
		listAll(client, cluster, namespace, DEPLOYMENT),
		listAll(client, cluster, namespace, STATEFUL_SET),
		listAll(client, cluster, namespace, POD)
	]);
	return { models, releases, deployments, statefulSets, pods } as WorkspaceObjects;
}

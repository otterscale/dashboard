import { createClient, type Transport } from '@connectrpc/connect';
import { ResourceService } from '@otterscale/api/resource/v1';

export async function hasRookCephCRD(
	transport: Transport,
	cluster: string,
	signal?: AbortSignal
): Promise<boolean> {
	const resourceClient = createClient(ResourceService, transport);
	try {
		// API discovery is available to any authenticated user, unlike
		// listing CRDs or cephclusters which requires extra RBAC.
		const response = await resourceClient.discovery({ cluster }, { signal });
		return response.apiResources.some(
			(apiResource) =>
				apiResource.group === 'ceph.rook.io' && apiResource.resource === 'cephclusters'
		);
	} catch (error) {
		if (signal?.aborted) throw error;
		console.error('Failed to discover API resources:', error);
		return false;
	}
}

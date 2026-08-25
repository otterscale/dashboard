import { createClient } from '@connectrpc/connect';
import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';

import type { GetRelatedResources, RelatedResource, RelatedResourceIdentifier } from '../types';

/** The identity of a listed object — all the linking needs from an item. */
type ListedObject = { metadata?: { name?: string; namespace?: string } };

/**
 * What the controller creates for a service. Nothing on the object names these,
 * so each kind has to be listed for.
 */
const relatedResourceIdentifiers: RelatedResourceIdentifier[] = [
	{ group: 'apps', version: 'v1', kind: 'Deployment', resource: 'deployments' },
	{
		group: 'leaderworkerset.x-k8s.io',
		version: 'v1',
		kind: 'LeaderWorkerSet',
		resource: 'leaderworkersets'
	},
	{ group: 'apps', version: 'v1', kind: 'ReplicaSet', resource: 'replicasets' },
	{ group: 'apps', version: 'v1', kind: 'StatefulSet', resource: 'statefulsets' },
	{ group: '', version: 'v1', kind: 'Service', resource: 'services' },
	{ group: '', version: 'v1', kind: 'Pod', resource: 'pods' },
	{
		group: 'inference.networking.k8s.io',
		version: 'v1',
		kind: 'InferencePool',
		resource: 'inferencepools'
	},
	{
		group: 'gateway.networking.k8s.io',
		version: 'v1',
		kind: 'HTTPRoute',
		resource: 'httproutes'
	}
];

/**
 * An LLMInferenceService's workloads carry its name as a label, so its relations
 * come from listing each kind the controller creates rather than from the object
 * itself.
 */
const getLLMInferenceServiceRelatedResources: GetRelatedResources = async ({
	cluster,
	namespace,
	name,
	transport,
	signal
}) => {
	const resourceClient = createClient(ResourceService, transport);
	const labelSelector = `app.kubernetes.io/part-of=llminferenceservice,app.kubernetes.io/name=${name}`;

	async function list(identifier: RelatedResourceIdentifier): Promise<RelatedResource[]> {
		try {
			const response = await resourceClient.list(
				{
					cluster,
					namespace,
					labelSelector,
					group: identifier.group,
					version: identifier.version,
					resource: identifier.resource
				} as ListRequest,
				{ signal }
			);
			return response.items.flatMap((item) => {
				const metadata = (item.object as ListedObject | undefined)?.metadata;
				return metadata?.name
					? [
							{
								...identifier,
								name: metadata.name,
								namespace: metadata.namespace ?? undefined
							} satisfies RelatedResource
						]
					: [];
			});
		} catch (error) {
			// One forbidden or missing kind should not empty the whole section.
			if (signal.aborted) return [];
			console.error(`Failed to list ${identifier.resource}:`, error);
			return [];
		}
	}

	const results = await Promise.all(
		relatedResourceIdentifiers.map((identifier) => list(identifier))
	);
	return results.flat();
};

export { getLLMInferenceServiceRelatedResources };

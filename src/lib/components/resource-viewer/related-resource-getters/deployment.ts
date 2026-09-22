import type { JsonObject } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource, RelatedResourceClass } from '../types';

/** An owner reference as the controller writes it onto a child object. */
type OwnerReference = { uid?: string };

/**
 * What a Deployment's controller creates directly. Nothing on the Deployment
 * names these, so the kinds are fixed here and listed for in its namespace; only
 * ReplicaSet is a direct child, the Pods below it belonging to the ReplicaSet.
 */
const childIdentifiers: RelatedResourceClass[] = [
	{ group: 'apps', version: 'v1', kind: 'ReplicaSet', resource: 'replicasets' }
];

/** Whether `object` is owned by the Deployment with this uid. */
function isOwnedBy(object: JsonObject | undefined, ownerUID: string): boolean {
	const ownerReferences = (lodash.get(object ?? {}, ['metadata', 'ownerReferences']) ??
		[]) as OwnerReference[];
	return ownerReferences.some((ownerReference) => ownerReference?.uid === ownerUID);
}

/**
 * A Deployment's children carry no label that is reliably its own — the pod
 * template labels are the user's to choose and a second Deployment may match
 * them — so the relation comes from ownership instead: every object of a child
 * kind in the namespace is listed and kept only when one of its owner references
 * carries this Deployment's uid.
 */
const getDeploymentRelatedResources: GetRelatedResources = async ({
	cluster,
	namespace,
	object,
	transport,
	signal
}) => {
	// Without a uid there is nothing to match children against, and matching on
	// name alone would pick up a same-named Deployment's replicas after a delete
	// and recreate.
	const uid = lodash.get(object, ['metadata', 'uid']) as string | undefined;
	if (!uid) return [];

	const resourceClient = createClient(ResourceService, transport);

	// The uid is a parameter rather than read from the closure so that it keeps
	// the narrowing the check above gave it.
	async function list(
		identifier: RelatedResourceClass,
		ownerUID: string
	): Promise<RelatedResource[]> {
		try {
			const response = await resourceClient.list(
				{
					cluster,
					namespace,
					group: identifier.group,
					version: identifier.version,
					resource: identifier.resource
				} as ListRequest,
				{ signal }
			);
			return response.items.flatMap((item) => {
				const childObject = item.object as JsonObject | undefined;
				const metadata = lodash.get(childObject ?? {}, ['metadata']) as {
					name?: string;
					namespace?: string;
				};
				if (!metadata?.name || !isOwnedBy(childObject, ownerUID)) return [];
				return [
					{
						...identifier,
						name: metadata.name,
						namespace: metadata.namespace ?? undefined,
						source: 'ownerReference',
						// The list already carried the object, so the section need not
						// fetch it again.
						object: childObject
					} satisfies RelatedResource
				];
			});
		} catch (error) {
			// One forbidden or missing kind should not empty the whole section.
			if (signal.aborted) return [];
			console.error(`Failed to list ${identifier.resource}:`, error);
			return [];
		}
	}

	const listed = await Promise.all(childIdentifiers.map((identifier) => list(identifier, uid)));
	return listed.flat();
};

export { getDeploymentRelatedResources };

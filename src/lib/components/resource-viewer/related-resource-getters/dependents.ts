import type { JsonObject } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource, RelatedResourceClass } from '../types';

type OwnerReference = { uid?: string };

const podIdentifier: RelatedResourceClass = {
	group: '',
	version: 'v1',
	kind: 'Pod',
	resource: 'pods'
};

const replicaSetIdentifier: RelatedResourceClass = {
	group: 'apps',
	version: 'v1',
	kind: 'ReplicaSet',
	resource: 'replicasets'
};

const jobIdentifier: RelatedResourceClass = {
	group: 'batch',
	version: 'v1',
	kind: 'Job',
	resource: 'jobs'
};

const directDependentsByOwnerResource: Record<string, RelatedResourceClass[]> = {
	deployments: [replicaSetIdentifier],
	replicasets: [podIdentifier],
	daemonsets: [podIdentifier],
	statefulsets: [podIdentifier],
	cronjobs: [jobIdentifier],
	jobs: [podIdentifier]
};

function isOwnedBy(object: JsonObject | undefined, ownerUID: string): boolean {
	const ownerReferences = (lodash.get(object ?? {}, ['metadata', 'ownerReferences']) ??
		[]) as OwnerReference[];
	return ownerReferences.some((ownerReference) => ownerReference?.uid === ownerUID);
}

function createDependentsRelatedResourcesGetter(
	dependentIdentifiers: RelatedResourceClass[]
): GetRelatedResources {
	return async ({ cluster, namespace, object, transport, signal }) => {
		const uid = lodash.get(object, ['metadata', 'uid']) as string | undefined;
		if (!uid) return [];

		const resourceClient = createClient(ResourceService, transport);

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
					const dependentObject = item.object as JsonObject | undefined;
					const metadata = lodash.get(dependentObject ?? {}, ['metadata']) as {
						name?: string;
						namespace?: string;
					};
					if (!metadata?.name || !isOwnedBy(dependentObject, ownerUID)) return [];
					return [
						{
							...identifier,
							name: metadata.name,
							namespace: metadata.namespace ?? undefined,
							source: 'ownerReference',
							object: dependentObject
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

		const listed = await Promise.all(
			dependentIdentifiers.map((identifier) => list(identifier, uid))
		);
		return listed.flat();
	};
}

const dependentsRelatedResourceGetters: Record<string, GetRelatedResources> = Object.fromEntries(
	Object.entries(directDependentsByOwnerResource).map(([resource, dependentIdentifiers]) => [
		resource,
		createDependentsRelatedResourcesGetter(dependentIdentifiers)
	])
);

export { dependentsRelatedResourceGetters };

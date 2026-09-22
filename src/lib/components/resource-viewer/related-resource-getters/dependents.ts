import type { JsonObject } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource, RelatedResourceClass } from '../types';

type OwnerReference = { uid?: string };

type DependentIdentifier = RelatedResourceClass & { matchesOwnerSelector: boolean };

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

const controllerRevisionIdentifier: RelatedResourceClass = {
	group: 'apps',
	version: 'v1',
	kind: 'ControllerRevision',
	resource: 'controllerrevisions'
};

/**
 * Direct dependents only: each level of the chain lists its own. Nothing below
 * is particular to these kinds, so any owner whose controller writes owner
 * references belongs here as one more row.
 */
const directDependentsByOwnerResource: Record<string, DependentIdentifier[]> = {
	deployments: [{ ...replicaSetIdentifier, matchesOwnerSelector: true }],
	replicasets: [{ ...podIdentifier, matchesOwnerSelector: true }],
	daemonsets: [
		{ ...controllerRevisionIdentifier, matchesOwnerSelector: false },
		{ ...podIdentifier, matchesOwnerSelector: true }
	],
	statefulsets: [
		{ ...controllerRevisionIdentifier, matchesOwnerSelector: false },
		{ ...podIdentifier, matchesOwnerSelector: true }
	],
	// A CronJob has no `spec.selector`, and its `spec.jobTemplate` labels are the
	// user's to leave empty.
	cronjobs: [{ ...jobIdentifier, matchesOwnerSelector: false }],
	jobs: [{ ...podIdentifier, matchesOwnerSelector: true }]
};

function isOwnedBy(object: JsonObject | undefined, ownerUID: string): boolean {
	const ownerReferences = (lodash.get(object ?? {}, ['metadata', 'ownerReferences']) ??
		[]) as OwnerReference[];
	return ownerReferences.some((ownerReference) => ownerReference?.uid === ownerUID);
}

/**
 * Only shrinks what the server sends — ownership still decides what is kept — so
 * this may be wider than the truth but never narrower. Hence `matchExpressions`
 * is dropped rather than translated, and an owner with no selector at all
 * narrows nothing.
 */
function buildNarrowingLabelSelector(owner: JsonObject): string {
	const matchLabels = (lodash.get(owner, ['spec', 'selector', 'matchLabels']) ?? {}) as Record<
		string,
		string
	>;
	return Object.entries(matchLabels)
		.map(([key, value]) => `${key}=${value}`)
		.join(',');
}

/**
 * An owner names none of its dependents and their labels are the user's to
 * choose, so the relation is read the way the garbage collector reads it: each
 * dependent kind is listed in the owner's namespace and kept only when it
 * carries the owner's uid. A dependent in another namespace cannot exist — the
 * API rejects an owner reference that crosses one.
 */
function createDependentsRelatedResourcesGetter(
	dependentIdentifiers: DependentIdentifier[]
): GetRelatedResources {
	return async ({ cluster, namespace, object, transport, signal }) => {
		const uid = lodash.get(object, ['metadata', 'uid']) as string | undefined;
		if (!uid) return [];

		const narrowingLabelSelector = buildNarrowingLabelSelector(object);
		const resourceClient = createClient(ResourceService, transport);

		async function list(
			dependent: DependentIdentifier,
			ownerUID: string
		): Promise<RelatedResource[]> {
			const { matchesOwnerSelector, ...identifier } = dependent;
			try {
				const response = await resourceClient.list(
					{
						cluster,
						namespace,
						group: identifier.group,
						version: identifier.version,
						resource: identifier.resource,
						labelSelector: matchesOwnerSelector ? narrowingLabelSelector : ''
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

		const listed = await Promise.all(dependentIdentifiers.map((dependent) => list(dependent, uid)));
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

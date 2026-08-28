import type { JsonObject } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import {
	type APIResource,
	type DiscoveryRequest,
	type GetRequest,
	ResourceService
} from '@otterscale/api/resource/v1';
import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource, RelatedResourcesContext } from '../types';

/** An entry of `metadata.ownerReferences`: the object this one belongs to. */
type OwnerReference = { apiVersion?: string; kind?: string; name?: string };

/**
 * An `apiVersion` split into group and version. A core resource carries a bare
 * version (`v1`) and an empty group; everything else is `group/version`.
 */
function splitAPIVersion(apiVersion: string): { group: string; version: string } {
	const separator = apiVersion.indexOf('/');
	return separator === -1
		? { group: '', version: apiVersion }
		: { group: apiVersion.slice(0, separator), version: apiVersion.slice(separator + 1) };
}

/**
 * What the cluster serves, by `group/kind`. An owner reference names a group and
 * a kind; a link needs the version, the plural resource, and whether the kind is
 * namespaced, and discovery is what knows them.
 */
function groupAPIResourcesByGroupKind(apiResources: APIResource[]): Map<string, APIResource[]> {
	const groupedAPIResources = new Map<string, APIResource[]>();
	for (const apiResource of apiResources) {
		// Subresources (`pods/log`) are not something to link to.
		if (apiResource.resource.includes('/')) continue;
		const key = `${apiResource.group}/${apiResource.kind}`;
		groupedAPIResources.set(key, [...(groupedAPIResources.get(key) ?? []), apiResource]);
	}
	return groupedAPIResources;
}

/**
 * The resource being viewed, as a relation to itself. Every section leads with
 * the object itself — it is the centre the rest hang off, and this way its
 * status sits in the same table as its relations'. Nothing is fetched: the
 * object is already in hand.
 */
function buildSelfRelatedResource({
	group,
	version,
	kind,
	resource,
	namespace,
	name,
	object
}: RelatedResourcesContext): RelatedResource {
	return {
		group,
		version,
		kind,
		resource,
		name,
		namespace: namespace || undefined,
		source: 'self',
		object
	};
}

/**
 * An object's owners: whatever `metadata.ownerReferences` names — the ReplicaSet
 * behind a Pod, the Deployment behind that, the controller CR behind a managed
 * object. Each reference carries only a kind and an apiVersion, so discovery
 * turns it into a linkable group/version/resource; a kind the cluster no longer
 * serves is dropped. An owner always lives in the object's own namespace, or
 * none when it is cluster-scoped. Each owner is then fetched, the same as every
 * other getter, so the section has the object and not just a link to it.
 */
const getOwnerReferenceRelatedResources: GetRelatedResources = async ({
	cluster,
	namespace,
	object,
	transport,
	signal
}) => {
	const ownerReferences = (lodash.get(object, ['metadata', 'ownerReferences']) ??
		[]) as OwnerReference[];
	if (ownerReferences.length === 0) return [];

	const resourceClient = createClient(ResourceService, transport);

	const apiResourcesByGroupKind = groupAPIResourcesByGroupKind(
		(await resourceClient.discovery({ cluster } as DiscoveryRequest, { signal })).apiResources
	);

	const identities = ownerReferences.flatMap((ownerReference) => {
		if (!ownerReference?.name || !ownerReference.kind) return [];

		const { group, version } = splitAPIVersion(ownerReference.apiVersion ?? '');
		const candidates = apiResourcesByGroupKind.get(`${group}/${ownerReference.kind}`) ?? [];
		// The version the reference was written with, when the cluster still serves
		// it; otherwise whatever discovery listed first, which is its preferred one.
		const apiResource =
			candidates.find((candidate) => candidate.version === version) ?? candidates[0];
		if (!apiResource) {
			// A kind the cluster no longer serves — its CRD was removed after the
			// reference was written, so there is nothing to link to.
			console.warn(
				`No API resource for owner reference ${ownerReference.apiVersion}/${ownerReference.kind}`
			);
			return [];
		}

		return [
			{
				group: apiResource.group,
				version: apiResource.version,
				kind: apiResource.kind,
				resource: apiResource.resource,
				name: ownerReference.name,
				source: 'ownerReference',
				// An owner reference is always same-namespace; a cluster-scoped owner
				// has none, and passing one would send the get down the wrong path.
				namespace: apiResource.namespaced ? namespace : ''
			} satisfies RelatedResource
		];
	});

	if (identities.length === 0) return [];

	return Promise.all(
		identities.map(async (identity) => {
			try {
				const getResponse = await resourceClient.get(
					{
						cluster,
						namespace: identity.namespace ?? '',
						group: identity.group,
						version: identity.version,
						resource: identity.resource,
						name: identity.name
					} as GetRequest,
					{ signal }
				);
				return { ...identity, object: getResponse.object as JsonObject } satisfies RelatedResource;
			} catch (error) {
				// An owner the reference still names but the cluster no longer has keeps
				// its link, just without an object to show for it.
				if (signal.aborted) return identity;
				console.error(`Failed to get ${identity.resource} ${identity.name}:`, error);
				return identity;
			}
		})
	);
};

/**
 * Any object's default relations are itself and its owners. A specific getter
 * adds what is particular to its kind on top of this.
 */
const getDefaultRelatedResources: GetRelatedResources = async (context) => {
	const owners = await getOwnerReferenceRelatedResources(context);
	return [buildSelfRelatedResource(context), ...owners];
};

export { buildSelfRelatedResource, getDefaultRelatedResources, getOwnerReferenceRelatedResources };

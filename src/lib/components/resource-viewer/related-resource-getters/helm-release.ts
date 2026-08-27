import type { JsonObject } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import {
	type APIResource,
	type DiscoveryRequest,
	type GetRequest,
	ResourceService
} from '@otterscale/api/resource/v1';
import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource } from '../types';

/** One object Helm applied, as Flux records it in `status.inventory`. */
type InventoryEntry = { id?: string; v?: string };

/**
 * What the cluster serves, by `group/kind`. An inventory entry names a group and
 * a kind; a link needs the version and the plural resource too, and discovery is
 * what knows them.
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
 * A HelmRelease's relations are the objects Helm applied, which Flux lists in
 * `status.inventory` — but as `namespace_name_group_kind`, so each entry needs
 * discovery before it can become a link. Each one is then fetched, the same as
 * every other getter, so the section has the object and not just a link to it.
 */
const getHelmReleaseRelatedResources: GetRelatedResources = async ({
	cluster,
	object,
	transport,
	signal
}) => {
	const entries = (lodash.get(object, ['status', 'inventory', 'entries']) ??
		[]) as InventoryEntry[];
	if (entries.length === 0) return [];

	const resourceClient = createClient(ResourceService, transport);
	const response = await resourceClient.discovery({ cluster } as DiscoveryRequest, { signal });
	const apiResourcesByGroupKind = groupAPIResourcesByGroupKind(response.apiResources);

	function findAPIResource(
		entryGroup: string,
		entryKind: string,
		entryVersion: string
	): APIResource | undefined {
		const candidates = apiResourcesByGroupKind.get(`${entryGroup}/${entryKind}`) ?? [];
		// The version the object was applied with, when the cluster still serves it;
		// otherwise whatever discovery listed first, which is its preferred version.
		return candidates.find((candidate) => candidate.version === entryVersion) ?? candidates[0];
	}

	const identities = entries.flatMap((entry) => {
		// Flux encodes each applied object as `namespace_name_group_kind`, with an
		// empty group for core resources and an empty namespace for cluster-scoped
		// ones. None of the four parts can itself contain an underscore.
		const parts = (entry.id ?? '').split('_');
		if (parts.length !== 4) return [];
		const [entryNamespace, entryName, entryGroup, entryKind] = parts;
		if (!entryName || !entryKind) return [];

		const apiResource = findAPIResource(entryGroup, entryKind, entry.v ?? '');
		if (!apiResource) {
			// A kind the cluster no longer serves — its CRD was removed after the
			// release applied it, so there is nothing to link to.
			console.warn(`No API resource for inventory entry ${entry.id}`);
			return [];
		}

		return [
			{
				group: apiResource.group,
				version: apiResource.version,
				kind: apiResource.kind,
				resource: apiResource.resource,
				name: entryName,
				// Kept as the empty string for a cluster-scoped object, so it does not
				// fall back to the namespace of the release.
				namespace: entryNamespace
			} satisfies RelatedResource
		];
	});

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
				// An entry the inventory still lists but the cluster no longer has keeps
				// its link, just without an object to show for it.
				if (signal.aborted) return identity;
				console.error(`Failed to get ${identity.resource} ${identity.name}:`, error);
				return identity;
			}
		})
	);
};

export { getHelmReleaseRelatedResources };

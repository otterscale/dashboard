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

type OwnerReference = { apiVersion?: string; kind?: string; name?: string };

function splitAPIVersion(apiVersion: string): { group: string; version: string } {
	const separator = apiVersion.indexOf('/');
	return separator === -1
		? { group: '', version: apiVersion }
		: { group: apiVersion.slice(0, separator), version: apiVersion.slice(separator + 1) };
}

function groupAPIResourcesByGroupKind(apiResources: APIResource[]): Map<string, APIResource[]> {
	const groupedAPIResources = new Map<string, APIResource[]>();
	for (const apiResource of apiResources) {
		if (apiResource.resource.includes('/')) continue;
		const key = `${apiResource.group}/${apiResource.kind}`;
		groupedAPIResources.set(key, [...(groupedAPIResources.get(key) ?? []), apiResource]);
	}
	return groupedAPIResources;
}

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
		const apiResource =
			candidates.find((candidate) => candidate.version === version) ?? candidates[0];
		if (!apiResource) {
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
				if (signal.aborted) return identity;
				console.error(`Failed to get ${identity.resource} ${identity.name}:`, error);
				return identity;
			}
		})
	);
};

const getDefaultRelatedResources: GetRelatedResources = async (context) => {
	const owners = await getOwnerReferenceRelatedResources(context);
	return owners;
};

export { buildSelfRelatedResource, getDefaultRelatedResources, getOwnerReferenceRelatedResources };

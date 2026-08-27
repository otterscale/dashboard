import type { JsonObject } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { type GetRequest, type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource, RelatedResourceClass } from '../types';

/** A `spec.baseRefs` entry: a config named by the user, resolved in this namespace. */
type BaseReference = { name?: string };

/** A `status.appliedConfigs` entry: a config the controller resolved, with its namespace. */
type AppliedConfiguration = { name?: string; namespace?: string };

/**
 * The configs an LLMInferenceService builds on. Both `spec.baseRefs` and
 * `status.appliedConfigs` point at these; neither names the kind, so it is fixed
 * here.
 */
const llmInferenceServiceConfigIdentifier: RelatedResourceClass = {
	group: 'serving.kserve.io',
	version: 'v1alpha2',
	kind: 'LLMInferenceServiceConfig',
	resource: 'llminferenceserviceconfigs'
};

/**
 * What the controller creates for a service. Nothing on the object names these,
 * so each kind has to be listed for.
 */
const relatedResourceIdentifiers: RelatedResourceClass[] = [
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
 * An LLMInferenceService's workloads carry its name as a label, so those
 * relations come from listing each kind the controller creates rather than from
 * the object itself. Its config relations do come off the object: the ones the
 * user names in `spec.baseRefs` and the full resolved set the controller records
 * in `status.appliedConfigs`.
 */
const getLLMInferenceServiceRelatedResources: GetRelatedResources = async ({
	cluster,
	namespace,
	name,
	object,
	transport,
	signal
}) => {
	const resourceClient = createClient(ResourceService, transport);
	const labelSelector = `app.kubernetes.io/part-of=llminferenceservice,app.kubernetes.io/name=${name}`;

	async function list(identifier: RelatedResourceClass): Promise<RelatedResource[]> {
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
				const metadata = item.object?.metadata as { name?: string; namespace?: string };
				return metadata?.name
					? [
							{
								...identifier,
								name: metadata.name,
								namespace: metadata.namespace ?? undefined,
								// The list already carried the object, so the section need not
								// fetch it again.
								object: item.object as JsonObject
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

	// `spec.baseRefs` names configs by name only, resolved in this namespace;
	// `status.appliedConfigs` is the resolved superset, each carrying its own
	// namespace. Key by name so an applied config's namespace wins over the guess.
	const baseRefs = (lodash.get(object, ['spec', 'baseRefs']) ?? []) as BaseReference[];
	const appliedConfigs = (lodash.get(object, ['status', 'appliedConfigs']) ??
		[]) as AppliedConfiguration[];

	const configIdentitiesByName = new Map<string, RelatedResource>();
	for (const ref of baseRefs) {
		if (!ref?.name) continue;
		configIdentitiesByName.set(ref.name, {
			...llmInferenceServiceConfigIdentifier,
			name: ref.name,
			namespace
		});
	}
	for (const config of appliedConfigs) {
		if (!config?.name) continue;
		configIdentitiesByName.set(config.name, {
			...llmInferenceServiceConfigIdentifier,
			name: config.name,
			namespace: config.namespace ?? namespace
		});
	}

	async function getConfig(identity: RelatedResource): Promise<RelatedResource> {
		try {
			const response = await resourceClient.get(
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
			return { ...identity, object: response.object as JsonObject } satisfies RelatedResource;
		} catch (error) {
			// A config the service still references but the cluster no longer has
			// keeps its link, just without an object to show for it.
			if (signal.aborted) return identity;
			console.error(`Failed to get ${identity.resource} ${identity.name}:`, error);
			return identity;
		}
	}

	const [listed, configs] = await Promise.all([
		Promise.all(relatedResourceIdentifiers.map((identifier) => list(identifier))),
		Promise.all([...configIdentitiesByName.values()].map((identity) => getConfig(identity)))
	]);
	return [...listed.flat(), ...configs];
};

export { getLLMInferenceServiceRelatedResources };

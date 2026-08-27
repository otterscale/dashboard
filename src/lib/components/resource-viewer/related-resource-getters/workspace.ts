import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource, RelatedResourceClass } from '../types';

/** A reference as a Workspace writes it into `status`. */
type ResourceReference = { name?: string; namespace?: string };

/**
 * What each `status` reference points at. A Workspace records only a name and a
 * namespace, so the kind it refers to has to be known here — and a key absent
 * from this map is something other than a reference (`conditions`, `phase`) and
 * is skipped rather than linked to.
 */
const statusResourceReferenceIdentifiers: Record<string, RelatedResourceClass> = {
	namespaceRef: {
		group: '',
		version: 'v1',
		kind: 'Namespace',
		resource: 'namespaces'
	},
	resourceQuotaRef: {
		group: '',
		version: 'v1',
		kind: 'ResourceQuota',
		resource: 'resourcequotas'
	},
	configMapRef: {
		group: '',
		version: 'v1',
		kind: 'ConfigMap',
		resource: 'configmaps'
	},
	limitRangeRef: {
		group: '',
		version: 'v1',
		kind: 'LimitRange',
		resource: 'limitranges'
	},
	networkPolicyRef: {
		group: 'networking.k8s.io',
		version: 'v1',
		kind: 'NetworkPolicy',
		resource: 'networkpolicies'
	},
	helmRepositoryRef: {
		group: 'source.toolkit.fluxcd.io',
		version: 'v1',
		kind: 'HelmRepository',
		resource: 'helmrepositories'
	},
	imagePullSecretRef: {
		group: '',
		version: 'v1',
		kind: 'Secret',
		resource: 'secrets'
	},
	roleBindingRefs: {
		group: 'rbac.authorization.k8s.io',
		version: 'v1',
		kind: 'RoleBinding',
		resource: 'rolebindings'
	}
};

/**
 * A Workspace's relations are the objects it created, and it names every one of
 * them in its own `status` — so this reads the object and asks the cluster
 * nothing.
 */
const getWorkspaceRelatedResources: GetRelatedResources = ({ object }) => {
	const status = (lodash.get(object, ['status']) ?? {}) as Record<string, unknown>;

	return Object.entries(status).flatMap(([key, value]) => {
		const identifier = statusResourceReferenceIdentifiers[key];
		if (!identifier) return [];

		const references = (Array.isArray(value) ? value : [value]) as ResourceReference[];
		return references.flatMap((reference) =>
			reference?.name
				? [
						{
							...identifier,
							name: reference.name,
							// A Workspace links to children in the namespace it created, not
							// the one it lives in.
							namespace: reference.namespace ?? undefined
						} satisfies RelatedResource
					]
				: []
		);
	});
};

export { getWorkspaceRelatedResources };

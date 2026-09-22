import type { JsonObject } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';
import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
import lodash from 'lodash';

import type { GetRelatedResources, RelatedResource, RelatedResourceClass } from '../types';

/** An owner reference as a controller writes it onto a child object. */
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

/** The revision history a DaemonSet or StatefulSet keeps for its rollouts. */
const controllerRevisionIdentifier: RelatedResourceClass = {
	group: 'apps',
	version: 'v1',
	kind: 'ControllerRevision',
	resource: 'controllerrevisions'
};

/**
 * What each workload kind's controller creates directly, keyed by the parent's
 * plural resource name. Nothing on these objects names their children, so the
 * kinds are fixed here — and only the direct ones, each level of the chain being
 * reachable from the row it belongs to (a Deployment lists its ReplicaSets, and
 * a ReplicaSet its Pods, rather than the Deployment listing both).
 */
const childIdentifiersByResource: Record<string, RelatedResourceClass[]> = {
	deployments: [replicaSetIdentifier],
	replicasets: [podIdentifier],
	daemonsets: [controllerRevisionIdentifier, podIdentifier],
	statefulsets: [controllerRevisionIdentifier, podIdentifier],
	cronjobs: [jobIdentifier],
	jobs: [podIdentifier]
};

/** Whether `object` is owned by the parent with this uid. */
function isOwnedBy(object: JsonObject | undefined, ownerUID: string): boolean {
	const ownerReferences = (lodash.get(object ?? {}, ['metadata', 'ownerReferences']) ??
		[]) as OwnerReference[];
	return ownerReferences.some((ownerReference) => ownerReference?.uid === ownerUID);
}

/**
 * A workload's children carry no label that is reliably its own — the pod
 * template labels are the user's to choose and a second workload may match them
 * — so the relation comes from ownership instead: every object of a child kind
 * in the namespace is listed and kept only when one of its owner references
 * carries the parent's uid.
 */
function createOwnedChildrenRelatedResourcesGetter(
	childIdentifiers: RelatedResourceClass[]
): GetRelatedResources {
	return async ({ cluster, namespace, object, transport, signal }) => {
		// Without a uid there is nothing to match children against, and matching on
		// name alone would pick up a same-named parent's children after a delete and
		// recreate.
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
}

/**
 * The getter for each kind whose relations are just the objects its controller
 * owns, ready for the dispatcher to look up by resource name.
 */
const ownedChildrenRelatedResourceGetters: Record<string, GetRelatedResources> = Object.fromEntries(
	Object.entries(childIdentifiersByResource).map(([resource, childIdentifiers]) => [
		resource,
		createOwnedChildrenRelatedResourcesGetter(childIdentifiers)
	])
);

export { ownedChildrenRelatedResourceGetters };

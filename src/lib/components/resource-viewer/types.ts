import type { JsonObject } from '@bufbuild/protobuf';
import type { Transport } from '@connectrpc/connect';

/**
 * The fetched resource, narrowed to the fields the viewer and its tabs actually
 * read. It still carries an open index signature because getters and `compute`
 * treat it as an arbitrary object.
 */
type Resource = {
	apiVersion?: string;
	kind?: string;
	metadata?: {
		name?: string;
		namespace?: string;
		uid?: string;
		creationTimestamp?: string;
		generation?: number;
		resourceVersion?: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	status?: {
		conditions?: unknown;
	};
	[key: string]: unknown;
};

/**
 * A resource worth linking to from another resource's page.
 *
 * `kind` and `namespaced` are carried rather than looked up because the link is
 * built entirely from them — the target page needs the full identity in its
 * search parameters, and a wrong `namespaced` sends the viewer to a page that
 * quietly finds nothing.
 */
type RelatedResource = {
	group: string;
	version: string;
	kind: string;
	resource: string;
	name: string;
	/**
	 * Where this resource lives, when that is not the namespace the section was
	 * given. A Workspace, for instance, links to children in the namespace it
	 * created rather than its own.
	 */
	namespace?: string;
	/**
	 * The related object itself, as the cluster returned it. Every getter now
	 * fetches its relations, so this is populated whenever the object still
	 * exists — and left unset only when the `get` failed or the object was
	 * deleted out from under the reference.
	 */
	object?: JsonObject;
};

/**
 * A related resource kind, before whatever names it has are known — what a
 * getter pairs with each name it reads off an object or a listing.
 */
type RelatedResourceClass = Omit<RelatedResource, 'name' | 'namespace' | 'object'>;

/**
 * What a related-resources getter is given: the identity of the resource being
 * viewed, the object itself, and the means to reach the cluster — some kinds
 * read their relations straight off the object, others have to list or discover
 * them.
 */
type RelatedResourcesContext = {
	cluster: string;
	group: string;
	version: string;
	kind: string;
	resource: string;
	namespace: string;
	name: string;
	object: JsonObject;
	transport: Transport;
	/**
	 * Aborted when the viewer is torn down or the object changes under it, so a
	 * getter that is still in flight can stop rather than resolve into a page
	 * that has moved on.
	 */
	signal: AbortSignal;
};

/**
 * How a page teaches the viewer what a kind relates to. Injected rather than
 * looked up, so the knowledge of a kind's relations lives with the page that
 * cares about that kind instead of in a registry the viewer has to carry.
 *
 * Always async: every getter reaches the cluster now, if only to fetch the
 * objects it already knows the identities of.
 */
type GetRelatedResources = (context: RelatedResourcesContext) => Promise<RelatedResource[]>;

export type {
	GetRelatedResources,
	RelatedResource,
	RelatedResourceClass,
	RelatedResourcesContext,
	Resource
};

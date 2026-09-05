import type { JsonObject } from '@bufbuild/protobuf';
import type { Transport } from '@connectrpc/connect';

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

type RelatedResourceSource =
	| 'self'
	| 'ownerReference'
	| 'labelSelector'
	| 'objectReference'
	| 'inventory';

type RelatedResource = {
	group: string;
	version: string;
	kind: string;
	resource: string;
	name: string;
	/** Where this relation came from — see {@link RelatedResourceSource}. */
	source: RelatedResourceSource;
	namespace?: string;
	object?: JsonObject;
};

type RelatedResourceClass = Omit<RelatedResource, 'name' | 'namespace' | 'object' | 'source'>;

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
	signal: AbortSignal;
};

type GetRelatedResources = (context: RelatedResourcesContext) => Promise<RelatedResource[]>;

export type {
	GetRelatedResources,
	RelatedResource,
	RelatedResourceClass,
	RelatedResourcesContext,
	RelatedResourceSource,
	Resource
};

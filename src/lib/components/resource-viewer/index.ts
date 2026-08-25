import ResourceViewer from './resource-viewer.svelte';

export { findRelatedResourcesGetter } from './actions';
export { ResourceViewer };
export type {
	GetRelatedResources,
	RelatedResource,
	RelatedResourceIdentifier,
	RelatedResourcesContext
} from './types';

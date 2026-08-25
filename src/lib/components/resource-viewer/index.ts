import ResourceViewer from './resource-viewer.svelte';

export { getRelatedResourcesGetter } from './related-resource-getters';
export { ResourceViewer };
export type {
	GetRelatedResources,
	RelatedResource,
	RelatedResourceIdentifier,
	RelatedResourcesContext
} from './types';

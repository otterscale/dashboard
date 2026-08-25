import type { GetRelatedResources } from '../types';
import { getHelmReleaseRelatedResources } from './helm-release/related-resources';
import { getLLMInferenceServiceRelatedResources } from './llm-inference-service/related-resources';
import { getWorkspaceRelatedResources } from './workspace/related-resources';

/**
 * The kinds whose relations are worth drawing, by plural resource. A kind absent
 * from this map has none worth listing, and the viewer links to just the
 * resource itself.
 */
const relatedResourcesGetters: Record<string, GetRelatedResources> = {
	workspaces: getWorkspaceRelatedResources,
	llminferenceservices: getLLMInferenceServiceRelatedResources,
	helmreleases: getHelmReleaseRelatedResources
};

/**
 * Whatever knows a resource's relations, for a page to hand to the viewer.
 * Returns `undefined` for a kind with nothing mapped.
 */
function findRelatedResourcesGetter(resource: string): GetRelatedResources | undefined {
	return relatedResourcesGetters[resource];
}

export {
	findRelatedResourcesGetter,
	getHelmReleaseRelatedResources,
	getLLMInferenceServiceRelatedResources,
	getWorkspaceRelatedResources
};

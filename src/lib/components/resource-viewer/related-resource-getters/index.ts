import type { GetRelatedResources } from '../types';
import { getDefaultRelatedResources } from './default';
import { getHelmReleaseRelatedResources } from './helm-release';
import { getLLMInferenceServiceRelatedResources } from './llm-inference-service';
import { getWorkspaceRelatedResources } from './workspace';

function getRelatedResourcesGetter(resource: string): GetRelatedResources | undefined {
	if (resource === 'workspaces') return getWorkspaceRelatedResources;
	if (resource === 'llminferenceservices') return getLLMInferenceServiceRelatedResources;
	if (resource === 'helmreleases') return getHelmReleaseRelatedResources;
	return getDefaultRelatedResources;
}

export { getRelatedResourcesGetter };

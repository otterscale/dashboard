import type { GetRelatedResources, RelatedResource } from '../types';
import {
	buildSelfRelatedResource,
	getDefaultRelatedResources,
	getOwnerReferenceRelatedResources
} from './default';
import { getHelmReleaseRelatedResources } from './helm-release';
import { getLLMInferenceServiceRelatedResources } from './llm-inference-service';
import { getWorkspaceRelatedResources } from './workspace';

/**
 * Identity of a related resource, for dropping the same one seen from two
 * getters. Deliberately without the version: an owner reference carries the
 * version discovery resolved, while a specific getter's identifier hard-codes
 * one, so keying on it would let the same object through as two rows.
 */
function relatedResourceKey(related: RelatedResource): string {
	return `${related.group}/${related.resource}/${related.namespace ?? ''}/${related.name}`;
}

/**
 * One row per distinct resource, the first occurrence winning. The getters draw
 * from disjoint sources — an object's owners are its parents, a specific getter
 * lists its children and references — so this only guards the rare overlap (an
 * owner that a getter also lists), and the concat order below keeps the more
 * specific `source` for it.
 */
function dedupeRelatedResources(relatedResources: RelatedResource[]): RelatedResource[] {
	const seen = new Set<string>();
	return relatedResources.filter((related) => {
		const key = relatedResourceKey(related);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Every kind's relations start with the object itself and its owner references;
 * a specific getter only adds what is particular to that kind. Wrapping the
 * specific getters here keeps that default in one place rather than repeated in
 * each of them. The specific results come before the owners so that, on the rare
 * overlap, the row keeps the specific getter's `source`.
 */
function withDefaultRelatedResources(getSpecific: GetRelatedResources): GetRelatedResources {
	return async (context) => {
		const [specific, owners] = await Promise.all([
			getSpecific(context),
			getOwnerReferenceRelatedResources(context)
		]);
		return dedupeRelatedResources([buildSelfRelatedResource(context), ...specific, ...owners]);
	};
}

function getRelatedResourcesGetter(resource: string): GetRelatedResources {
	if (resource === 'workspaces') return withDefaultRelatedResources(getWorkspaceRelatedResources);
	if (resource === 'llminferenceservices')
		return withDefaultRelatedResources(getLLMInferenceServiceRelatedResources);
	if (resource === 'helmreleases') return withDefaultRelatedResources(getHelmReleaseRelatedResources);
	return getDefaultRelatedResources;
}

export { getRelatedResourcesGetter };

import type { JsonObject } from '@bufbuild/protobuf';
import type { Schema } from '@sjsf/form';
import type { Component } from 'svelte';

import type { RelatedResource } from '../types';
import DefaultViewer from './default/view.svelte';
import LicenseViewer from './license/view.svelte';
import LLMInferenceServiceViewer from './llm-inference-service/view.svelte';
import WorkspaceViewer from './workspace/view.svelte';

type ViewerProps = {
	object: JsonObject;
	schema?: Schema;
	/**
	 * The resource being viewed, as a related-resource entry.
	 *
	 * Passed in rather than read off `object`, because an object carries its
	 * `apiVersion` and `kind` but not the plural resource name or whether it is
	 * namespaced — and those are what a link to it needs.
	 */
	self: RelatedResource;
};
type ViewerType = Component<ViewerProps>;

function getResourceViewer(resource: string): ViewerType {
	if (resource === 'workspaces') {
		return WorkspaceViewer as ViewerType;
	}
	if (resource === 'llminferenceservices') {
		return LLMInferenceServiceViewer as ViewerType;
	}
	if (resource === 'licenses') {
		return LicenseViewer as ViewerType;
	}
	return DefaultViewer as ViewerType;
}

export { getResourceViewer };
export type { ViewerProps, ViewerType };

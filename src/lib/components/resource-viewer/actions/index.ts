import type { JsonObject } from '@bufbuild/protobuf';
import type { Schema } from '@sjsf/form';
import type { Component } from 'svelte';

import DefaultViewer from './default/view.svelte';
import LicenseViewer from './license/view.svelte';
import LLMInferenceServiceViewer from './llm-inference-service/view.svelte';
import WorkspaceViewer from './workspace/view.svelte';

type ViewerProps = {
	group: string;
	version: string;
	kind: string;
	resource: string;
	namespace: string;
	name: string;
	object: JsonObject;
	schema?: Schema;
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

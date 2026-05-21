import type { JsonObject } from '@bufbuild/protobuf';
import type { Schema } from '@sjsf/form';
import type { Component } from 'svelte';

import DefaultViewer from './default-viewer.svelte';
import LLMInferenceServiceViewer from './llm-inference-service-viewer.svelte';
import WorkspaceEditor from './workspace-editor.svelte';
import WorkspaceViewer from './workspaces-viewer.svelte';

type ViewerProps = { object: JsonObject; schema?: Schema };
type ViewerType = Component<ViewerProps>;

type EditorProps = {
	role?: string;
	cluster: string;
	group: string;
	version: string;
	kind: string;
	resource: string;
	schema?: Schema;
	object?: JsonObject;
	onsuccess?: () => void;
};
type EditorType = Component<EditorProps> | null;

function getResourceViewer(resource: string): ViewerType {
	if (resource === 'workspaces') {
		return WorkspaceViewer as ViewerType;
	}
	if (resource === 'llminferenceservices') {
		return LLMInferenceServiceViewer as ViewerType;
	}
	return DefaultViewer as ViewerType;
}

function getEditor(resource: string): EditorType {
	if (resource === 'workspaces') {
		return WorkspaceEditor as unknown as EditorType;
	}
	return null;
}

export { getEditor, getResourceViewer };
export type { EditorType, ViewerType };

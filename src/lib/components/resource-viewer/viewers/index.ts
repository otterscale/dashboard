import type { Component } from 'svelte';

import ApplicationsViewer from './applications-viewer.svelte';
import DefaultViewer from './default-viewer.svelte';
import ModelServicesViewer from './model-service-viewer.svelte';
import WorkspaceEditor from './workspace-editor.svelte';
import WorkspaceViewer from './workspaces-viewer.svelte';

type ViewerProps = { object: any; schema?: any };
type ViewerType = Component<ViewerProps>;

type EditorProps = {
	cluster: string;
	group: string;
	version: string;
	kind: string;
	resource: string;
	schema?: any;
	object?: any;
	onsuccess?: () => void;
};
type EditorType = Component<EditorProps> | null;

function getResourceViewer(resource: string): ViewerType {
	if (resource === 'applications') {
		return ApplicationsViewer as ViewerType;
	}
	if (resource === 'modelservices') {
		return ModelServicesViewer as ViewerType;
	}
	if (resource === 'workspaces') {
		return WorkspaceViewer as ViewerType;
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

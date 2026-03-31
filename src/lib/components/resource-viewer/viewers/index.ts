import type { Component } from 'svelte';

import Applications from './applications.svelte';
import Default from './default.svelte';
import Edit from './edit-workspace.svelte';
import ModelServices from './modelservices.svelte';
import Workspaces from './workspaces.svelte';

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
		return Applications as ViewerType;
	}
	if (resource === 'modelservices') {
		return ModelServices as ViewerType;
	}
	if (resource === 'workspaces') {
		return Workspaces as ViewerType;
	}
	return Default as ViewerType;
}

function getEditor(resource: string): EditorType {
	if (resource === 'workspaces') {
		return Edit as unknown as EditorType;
	}
	return null;
}

export { getEditor, getResourceViewer };
export type { EditorType, ViewerType };

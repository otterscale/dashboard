import type { Component } from 'svelte';

import EditSheet from '$lib/components/dynamic-form/workspace/edit-sheet.svelte';

import Default from './default.svelte';
import Workspaces from './workspaces.svelte';

type ViewerProps = { object: any; schema?: any };
type ViewerType = Component<ViewerProps>;

type EditorProps = { name: string; schema?: any; object?: any; onsuccess?: () => void };
type EditorType = Component<EditorProps> | null;

function getResourceViewer(resource: string): ViewerType {
	if (resource === 'workspaces') {
		return Workspaces as ViewerType;
	}
	return Default as ViewerType;
}

function getEditor(resource: string): EditorType {
	if (resource === 'workspaces') {
		return EditSheet as unknown as EditorType;
	}
	return null;
}

export { getEditor, getResourceViewer };
export type { EditorType, ViewerType };

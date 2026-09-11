/* eslint-disable @typescript-eslint/no-explicit-any */
// Placeholder — the enterprise edition overlays this file (ee/src).

export const VELERO_GROUP = '';
export const VELERO_VERSION = '';
export const VELERO_DEFAULT_NAMESPACE = '';

export async function findVeleroNamespace(...args: any[]): Promise<string> {
	void args;
	return '';
}

export function veleroTimestampSuffix(...args: any[]): string {
	void args;
	return '';
}

export function hasResourceVerb(...args: any[]): boolean {
	void args;
	return false;
}

export async function requestVeleroDownloadURL(...args: any[]): Promise<string> {
	void args;
	return '';
}

export const WORKSPACE_CLUSTER_SCOPED_RESOURCE = '';
export const WORKSPACE_NAMESPACE_LABEL = '';
export type WorkspaceNamespace = any;
export async function listWorkspaceNamespaces(...args: any[]): Promise<WorkspaceNamespace[]> {
	void args;
	return [];
}

export function isNamespaceScopedBackup(...args: any[]): boolean {
	void args;
	return false;
}

export function workspaceDefinitionsRestoreManifest(...args: any[]): Record<string, unknown> {
	void args;
	return {};
}

export type VeleroBackup = any;
export type VeleroRestore = any;
export type VeleroSchedule = any;
export type VeleroBackupStorageLocation = any;
export type VeleroDownloadRequest = any;

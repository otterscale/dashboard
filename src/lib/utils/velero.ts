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

export type VeleroBackupRepository = any;
export async function deleteBackupRepositoriesForLocation(
	...args: any[]
): Promise<{ deleted: string[]; failed: { name: string; error: string }[] }> {
	void args;
	return { deleted: [], failed: [] };
}

export function hasRepositoryNotReadyError(...args: any[]): boolean {
	void args;
	return false;
}
export async function resetNotReadyBackupRepositories(
	...args: any[]
): Promise<{ deleted: string[]; failed: { name: string; error: string }[] }> {
	void args;
	return { deleted: [], failed: [] };
}

export type DeleteBackupResult = any;
export type VeleroDeleteBackupRequest = any;
export async function waitForDeleteBackupRequest(...args: any[]): Promise<DeleteBackupResult> {
	void args;
	return null;
}

export const OBJECT_BUCKET_GROUP = '';
export const OBJECT_BUCKET_VERSION = '';
export const INTERNAL_BUCKET_CLAIM: any = {};
export type InternalBucketStatus = any;
export type InternalBucket = any;

export async function hasInternalObjectStore(...args: any[]): Promise<boolean> {
	void args;
	return false;
}

export async function getInternalBucketStatus(
	...args: any[]
): Promise<InternalBucketStatus | null> {
	void args;
	return null;
}

export async function ensureInternalBucket(...args: any[]): Promise<InternalBucket> {
	void args;
	return null;
}

export const WORKSPACE_CLUSTER_SCOPED_RESOURCE = '';
export const WORKSPACE_NAMESPACE_LABEL = '';
export type WorkspaceNamespace = any;
export async function listWorkspaceNamespaces(...args: any[]): Promise<WorkspaceNamespace[]> {
	void args;
	return [];
}

export async function listNamespaces(...args: any[]): Promise<string[]> {
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

export type VolumeBackupMethod = any;
export const VOLUME_BACKUP_METHOD_LABELS: Record<string, string> = {};
export const VELERO_CSI_FEATURE_FLAG = '';
export const SNAPSHOT_GROUP = '';
export const SNAPSHOT_VERSION = '';
export const VOLUME_SNAPSHOT_CLASS_LABEL = '';
export const VOLUME_SNAPSHOT_CLASS_DEFAULT_ANNOTATION = '';
export type SnapshotStorageClass = any;
export type CSISnapshotReadiness = any;

export function volumeBackupSpec(...args: any[]): Record<string, any> {
	void args;
	return {};
}

export function volumeBackupMethodOf(...args: any[]): any {
	void args;
	return '';
}

export function volumePolicyConfigMapName(...args: any[]): string {
	void args;
	return '';
}

export function volumePolicyConfigMapManifest(...args: any[]): Record<string, unknown> {
	void args;
	return {};
}

export async function createWithVolumePolicy(...args: any[]): Promise<void> {
	void args;
}

export async function probeCSISnapshotReadiness(...args: any[]): Promise<any> {
	void args;
	return {};
}

export async function probeVeleroCSIFeature(...args: any[]): Promise<boolean | undefined> {
	void args;
	return undefined;
}

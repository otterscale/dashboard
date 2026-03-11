import type { Component } from 'svelte';

import ApplicationActions from './application/actions.svelte';
import ApplicationCreate from './application/create.svelte';
import CronJobActions from './cronjob/actions.svelte';
import CronJobCreate from './cronjob/create.svelte';
import DefaultActions from './default/actions.svelte';
import DefaultCreate from './default/create.svelte';
import ModelArtifactActions from './model-artifact/actions.svelte';
import ModelArtifactCreate from './model-artifact/create.svelte';
import ModelServiceActions from './model-service/actions.svelte';
import ModelServiceCreate from './model-service/create.svelte';
import PodActions from './pod/actions.svelte';
import ResourceQuotaActions from './resource-quota/actions.svelte';
import ResourceQuotaCreate from './resource-quota/create.svelte';
import SimpleAppActions from './simple-app/actions.svelte';
import SimpleAppCreate from './simple-app/create.svelte';
import WorkloadActions from './workload/actions.svelte';
import WorkspaceActions from './workspace/actions.svelte';
import WorkspaceCreate from './workspace/create.svelte';

type RoleType = 'admin' | 'edit' | 'view';

type CreateType = Component<{
	cluster?: string;
	namespace?: string;
	group?: string;
	version?: string;
	kind?: string;
	resource?: string;
	schema?: any;
}> | null;
type ActionsType = Component<{
	row?: any;
	schema?: any;
	object?: any;
	cluster?: string;
	namespace?: string;
	group?: string;
	version?: string;
	kind?: string;
	resource?: string;
	onsuccess?: () => void;
}> | null;

function getCreate(kind: string): CreateType {
	switch (kind) {
		case 'Application':
			return ApplicationCreate as CreateType;
		case 'CronJob':
			return CronJobCreate as CreateType;
		case 'ModelService':
			return ModelServiceCreate as CreateType;
		case 'ModelArtifact':
			return ModelArtifactCreate as CreateType;
		case 'ResourceQuota':
			return ResourceQuotaCreate as CreateType;
		case 'SimpleApp':
			return SimpleAppCreate as CreateType;
		case 'Workspace':
			return WorkspaceCreate as CreateType;
		default:
			return DefaultCreate as CreateType;
	}
}

function getActions(kind: string): ActionsType {
	switch (kind) {
		case 'Application':
			return ApplicationActions as ActionsType;
		case 'Pod':
			return PodActions as ActionsType;
		case 'Deployment':
		case 'StatefulSet':
		case 'ReplicaSet':
		case 'DaemonSet':
			return WorkloadActions as ActionsType;
		case 'CronJob':
			return CronJobActions as ActionsType;
		case 'ModelService':
			return ModelServiceActions as ActionsType;
		case 'ModelArtifact':
			return ModelArtifactActions as ActionsType;
		case 'ResourceQuota':
			return ResourceQuotaActions as ActionsType;
		case 'SimpleApp':
			return SimpleAppActions as ActionsType;
		case 'Workspace':
			return WorkspaceActions as ActionsType;
		default:
			return DefaultActions as ActionsType;
	}
}

export { getActions, getCreate };
export type { ActionsType, CreateType, RoleType };

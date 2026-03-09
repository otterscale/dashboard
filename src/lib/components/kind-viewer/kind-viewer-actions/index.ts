import type { Component } from 'svelte';

import ApplicationActions from './application/actions.svelte';
import ApplicationCreate from './application/new-create.svelte';
import CronJobActions from './cronjob/actions.svelte';
import CronJobCreate from './cronjob/create.svelte';
import DefaultActions from './default/actions.svelte';
import DefaultCreate from './default/create.svelte';
import ResourceQuotaActions from './resource-quota/actions.svelte';
import ResourceQuotaCreate from './resource-quota/create.svelte';
import WorkspaceActions from './workspace/actions.svelte';
import WorkspaceCreate from './workspace/new-create.svelte'; // TODO: Back to create before push

type RoleType = 'admin' | 'edit' | 'view';

type CreateType = Component<{
	cluster?: string;
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
	group?: string;
	version?: string;
	kind?: string;
	resource?: string;
	onsuccess?: () => void;
}> | null;

function getCreate(kind: string): CreateType {
	switch (kind) {
		case 'CronJob':
			return CronJobCreate as CreateType;
		case 'ResourceQuota':
			return ResourceQuotaCreate as CreateType;
		case 'Application':
			return ApplicationCreate as CreateType;
		case 'Workspace':
			return WorkspaceCreate as CreateType;
		default:
			return DefaultCreate as CreateType;
	}
}

function getActions(kind: string): ActionsType {
	switch (kind) {
		case 'CronJob':
			return CronJobActions as ActionsType;
		case 'ResourceQuota':
			return ResourceQuotaActions as ActionsType;
		case 'Application':
			return ApplicationActions as ActionsType;
		case 'Workspace':
			return WorkspaceActions as ActionsType;
		default:
			return DefaultActions as ActionsType;
	}
}

export { getActions, getCreate };
export type { ActionsType, CreateType, RoleType };

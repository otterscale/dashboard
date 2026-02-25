import type { Component } from 'svelte';

import CronJobActions from './cronjob/actions.svelte';
import CronJobCreate from './cronjob/create.svelte';
import DefaultActions from './default/actions.svelte';
import DefaultCreate from './default/create.svelte';
import ResourceQuotaActions from './resource-quota/actions.svelte';
import ResourceQuotaCreate from './resource-quota/create.svelte';
import SimpleAppActions from './simple-app/actions.svelte';
import SimpleAppCreate from './simple-app/create.svelte';
import WorkspaceActions from './workspace/actions.svelte';
import WorkspaceCreate from './workspace/create.svelte';

type RoleType = 'admin' | 'edit' | 'view';

type CreateType = Component<{ schema?: any }> | null;
type ActionsType = Component<{
	row?: any;
	schema?: any;
	object?: any;
	cluster?: string;
	onsuccess?: () => void;
}> | null;

function getCreate(kind: string): CreateType {
	switch (kind) {
		case 'CronJob':
			return CronJobCreate as CreateType;
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
		case 'CronJob':
			return CronJobActions as ActionsType;
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

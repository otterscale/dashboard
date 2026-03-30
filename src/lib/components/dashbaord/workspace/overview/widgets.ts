import type { WidgetDefinition } from '$lib/components/custom/widget-grid';

import PodRolloutHealth from './pod-rollout-health.svelte';
import ResourceQuota from './resource-quota.svelte';
import Storage from './storage.svelte';
import WorkloadHealth from './workload-health.svelte';

/** Workspace overview tiles; `namespace` is merged in at runtime by the dashboard shell. */
export const workspaceOverviewWidgets = [
	{
		key: 'resource-quota',
		class: 'col-span-2 row-span-1 md:col-span-2 lg:col-span-4',
		component: ResourceQuota
	},
	{
		key: 'workload-health',
		class: 'col-span-2 row-span-1 md:col-span-2 lg:col-span-4',
		component: WorkloadHealth,
		needsCluster: true
	},
	{
		key: 'storage',
		class: 'col-span-2 row-span-1 md:col-span-2 lg:col-span-4',
		component: Storage
	},
	{
		key: 'pod-rollout-health',
		class: 'col-span-2 row-span-1 md:col-span-2 lg:col-span-12',
		component: PodRolloutHealth
	}
] as unknown as WidgetDefinition[];

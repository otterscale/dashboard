import type { WidgetDefinition } from '$lib/components/custom/widget-grid';

import PodRolloutHealth from './pod-rollout-health.svelte';
import ResourceQuota from './resource-quota.svelte';
import Storage from './storage.svelte';
import WorkloadHealth from './workload-health.svelte';

/** Workspace overview tiles; `namespace` is merged in at runtime by the dashboard shell. */
export const workspaceOverviewWidgets = [
	{
		key: 'resource-quota',
		class: 'order-2 col-span-full xl:col-span-6',
		component: ResourceQuota
	},
	{
		key: 'workload-health',
		class: 'order-3 col-span-full md:col-span-6 xl:col-span-3',
		component: WorkloadHealth,
		needsCluster: true
	},
	{
		key: 'storage',
		class: 'order-4 col-span-full md:col-span-6 xl:col-span-3',
		component: Storage
	},
	{
		key: 'pod-rollout-health',
		// Renders two grid items of its own (headline counts first, breakdown last): see the component.
		class: 'contents',
		component: PodRolloutHealth
	}
] as unknown as WidgetDefinition[];

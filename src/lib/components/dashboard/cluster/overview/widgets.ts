import type { WidgetDefinition } from '$lib/components/custom/widget-grid';

import Ai100Disk from './ai100-disk.svelte';
import Consumption from './consumption.svelte';
import CpuUsage from './cpu.svelte';
import Deployments from './deployments.svelte';
import Gpu from './gpu.svelte';
import Health from './health.svelte';
import Information from './information.svelte';
import MemoryUsage from './memory.svelte';
import Nodes from './nodes.svelte';
import Pods from './pods.svelte';
import Uptime from './uptime.svelte';

export const widgets = [
	{ key: 'health', class: 'min-w-0 bg-card', component: Health },
	{ key: 'uptime', class: 'min-w-0 bg-card', component: Uptime },
	{
		key: 'information',
		class: 'min-w-0 bg-card',
		component: Information
	},
	{
		key: 'consumption',
		class: 'min-w-0 bg-card',
		component: Consumption
	},
	{ key: 'nodes', class: 'min-w-0 bg-card', component: Nodes },
	{
		key: 'deployments',
		class: 'min-w-0 bg-card',
		component: Deployments
	},
	{ key: 'pods', class: 'contents', component: Pods },
	{ key: 'cpu', class: 'col-span-12 sm:col-span-6 xl:col-span-3', component: CpuUsage },
	{ key: 'memory', class: 'col-span-12 sm:col-span-6 xl:col-span-3', component: MemoryUsage },
	{ key: 'gpu', class: 'col-span-12 sm:col-span-6 xl:col-span-3', component: Gpu },
	{
		key: 'ai100-disk',
		class: 'col-span-12 sm:col-span-6 xl:col-span-3',
		component: Ai100Disk
	}
] satisfies WidgetDefinition[];

/** The three rows of the overview: a band of cluster facts, a band of pod counts, the resource cards. */
const keysOf = (...keys: string[]) => widgets.filter((widget) => keys.includes(widget.key));
export const factWidgets = keysOf(
	'health',
	'uptime',
	'information',
	'consumption',
	'nodes',
	'deployments'
);
export const podWidgets = keysOf('pods');
export const resourceWidgets = keysOf('cpu', 'memory', 'gpu', 'ai100-disk');

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
	{ key: 'health', class: 'col-span-6 xl:col-span-3', component: Health },
	{ key: 'uptime', class: 'col-span-6 xl:col-span-3', component: Uptime },
	{
		key: 'information',
		class: 'col-span-6 xl:col-span-3',
		component: Information
	},
	{
		key: 'consumption',
		class: 'col-span-6 xl:col-span-3',
		component: Consumption
	},
	{ key: 'nodes', class: 'col-span-6 xl:col-span-3', component: Nodes },
	{
		key: 'deployments',
		class: 'col-span-6 xl:col-span-3',
		component: Deployments
	},
	{ key: 'pods', class: 'col-span-12 xl:col-span-6', component: Pods },
	{ key: 'cpu', class: 'col-span-12 sm:col-span-6 xl:col-span-3', component: CpuUsage },
	{ key: 'memory', class: 'col-span-12 sm:col-span-6 xl:col-span-3', component: MemoryUsage },
	{ key: 'gpu', class: 'col-span-12 sm:col-span-6 xl:col-span-3', component: Gpu },
	{
		key: 'ai100-disk',
		class: 'col-span-12 sm:col-span-6 xl:col-span-3',
		component: Ai100Disk
	}
] satisfies WidgetDefinition[];

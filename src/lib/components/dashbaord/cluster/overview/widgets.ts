import type { WidgetDefinition } from '$lib/components/custom/widget-grid';

import Consumption from './consumption.svelte';
import CpuUsage from './cpu.svelte';
import Deployments from './deployments.svelte';
import GPUMemoryUsage from './gpu-memory.svelte';
import GPUUtilization from './gpu-utilization.svelte';
import Health from './health.svelte';
import Information from './information.svelte';
import MemoryUsage from './memory.svelte';
import Nodes from './nodes.svelte';
import Pods from './pods.svelte';
import Uptime from './uptime.svelte';

export const widgets = [
	{ key: 'health', class: 'col-span-1 row-span-1', component: Health },
	{ key: 'uptime', class: 'col-span-1 row-span-1', component: Uptime },
	{ key: 'information', class: 'col-span-1 row-span-1', component: Information },
	{ key: 'consumption', class: 'col-span-1 row-span-1', component: Consumption },
	{ key: 'nodes', class: 'col-span-1 row-span-1', component: Nodes },
	{ key: 'deployments', class: 'col-span-1 row-span-1', component: Deployments },
	{ key: 'pods', class: 'col-span-2 row-span-1', component: Pods },
	{ key: 'cpu', class: 'col-span-1 row-span-2', component: CpuUsage },
	{ key: 'memory', class: 'col-span-1 row-span-2', component: MemoryUsage },
	{ key: 'gpu-memory', class: 'col-span-1 row-span-2', component: GPUMemoryUsage },
	{ key: 'gpu-utilization', class: 'col-span-1 row-span-2', component: GPUUtilization }
] satisfies WidgetDefinition[];

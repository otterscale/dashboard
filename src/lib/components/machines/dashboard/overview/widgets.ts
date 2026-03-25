import type { WidgetDefinition } from '$lib/components/custom/widget-grid';

import CPU from './cpu.svelte';
import GPU from './gpu.svelte';
import GPUMemory from './gpu-memory.svelte';
import Memory from './memory.svelte';
import NodeProportion from './node-proportion.svelte';
import Nodes from './nodes.svelte';
import Storage from './storage.svelte';
import SystemLoad from './system_load.svelte';

export const widgets = [
	{ key: 'cpu', class: 'col-span-4 row-span-2', component: CPU },
	{ key: 'memory', class: 'col-span-4 row-span-2', component: Memory },
	{ key: 'storage', class: 'col-span-4', component: Storage },
	{ key: 'nodes', class: 'col-span-6 row-span-2', component: Nodes },
	{ key: 'gpu', class: 'col-span-2', component: GPU },
	{ key: 'gpu-memory', class: 'col-span-2', component: GPUMemory },
	{ key: 'system-load', class: 'col-span-12', component: SystemLoad },
	{ key: 'node-proportion', class: 'col-span-4', component: NodeProportion }
] satisfies WidgetDefinition[];

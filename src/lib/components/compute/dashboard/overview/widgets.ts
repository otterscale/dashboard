import type { WidgetDefinition } from '$lib/components/custom/widget-grid';

import Controller from './controller.svelte';
import CPU from './cpu.svelte';
import Instance from './instance.svelte';
import Memory from './memory.svelte';
import NetworkTraffic from './network-traffic.svelte';
import ThroughtPut from './throughput.svelte';
import Pod from './virtual-machine.svelte';
import Worker from './worker.svelte';

export const widgets = [
	{ key: 'controller', class: 'col-span-2', component: Controller },
	{ key: 'worker', class: 'col-span-2', component: Worker },
	{ key: 'cpu', class: 'col-span-4 row-span-2', component: CPU, needsNamespace: true },
	{ key: 'memory', class: 'col-span-4 row-span-2', component: Memory, needsNamespace: true },
	{ key: 'pod', class: 'col-span-2 col-start-1', component: Pod, needsNamespace: true },
	{ key: 'instance', class: 'col-span-2', component: Instance, needsNamespace: true },
	{ key: 'network-traffic', class: 'col-span-6', component: NetworkTraffic, needsNamespace: true },
	{ key: 'throughput', class: 'col-span-6', component: ThroughtPut, needsNamespace: true }
] satisfies WidgetDefinition[];

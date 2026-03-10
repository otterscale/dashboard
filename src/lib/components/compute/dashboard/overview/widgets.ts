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
	{ key: 'cpu', class: 'col-span-4 row-span-2', component: CPU },
	{ key: 'memory', class: 'col-span-4 row-span-2', component: Memory },
	{ key: 'pod', class: 'col-span-2 col-start-1', component: Pod },
	{ key: 'instance', class: 'col-span-2', component: Instance },
	{ key: 'network-traffic', class: 'col-span-6', component: NetworkTraffic },
	{ key: 'throughput', class: 'col-span-6', component: ThroughtPut }
] satisfies WidgetDefinition[];

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
	{ key: 'controller', class: 'col-span-2', component: Controller, needsCluster: true },
	{ key: 'worker', class: 'col-span-2', component: Worker, needsCluster: true },
	{ key: 'cpu', class: 'col-span-4 row-span-2', component: CPU, needsCluster: true },
	{ key: 'memory', class: 'col-span-4 row-span-2', component: Memory, needsCluster: true },
	{ key: 'pod', class: 'col-span-2 col-start-1', component: Pod, needsCluster: true },
	{ key: 'instance', class: 'col-span-2', component: Instance, needsCluster: true },
	{ key: 'network-traffic', class: 'col-span-6', component: NetworkTraffic, needsCluster: true },
	{ key: 'throughput', class: 'col-span-6', component: ThroughtPut, needsCluster: true }
] satisfies WidgetDefinition[];

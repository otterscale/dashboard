import type { GpuCard } from '../lib/gpu-cards';
import type { Group } from '../lib/workspaces';

export type Resource = 'cpu' | 'memory' | 'gpu';
export type Measure = 'usage' | 'request' | 'limit' | 'allocated';

export type OccupancyPod = {
	key: string;
	namespace: string;
	pod: string;
	group: Group;
	/** Usage, request, limit: cores. */
	cpu: [number, number, number];
	/** Usage, request, limit: bytes. */
	memory: [number, number, number];
	/** HAMi-tracked use across this node's cards; undefined when not reported. */
	gpuUsed: number | undefined;
	/** HAMi allocation across this node's cards. */
	gpuAllocated: number | undefined;
	/** Cards the pod holds anywhere in the cluster. */
	gpuCards: number;
};

/** What one request answers. A pod's group is added at render, so a late workspace list still applies. */
export type Occupancy = {
	pods: Omit<OccupancyPod, 'group'>[];
	cpuAllocatable: number | undefined;
	memAllocatable: number | undefined;
	cards: GpuCard[];
	/** Cards each pod holds an allocation on, across the cluster, by `namespace/pod`. */
	cardsOfPod: Map<string, number>;
};

export const MEASURE_INDEX: Record<'usage' | 'request' | 'limit', 0 | 1 | 2> = {
	usage: 0,
	request: 1,
	limit: 2
};

/** The number a pod contributes to the map for a resource and measure. */
export function podValue(pod: OccupancyPod, resource: Resource, measure: Measure): number {
	if (resource === 'gpu') {
		return (measure === 'usage' ? pod.gpuUsed : pod.gpuAllocated) ?? 0;
	}
	const idx = MEASURE_INDEX[measure === 'allocated' ? 'request' : measure];
	return pod[resource][idx];
}

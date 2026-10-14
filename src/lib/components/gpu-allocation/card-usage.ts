import type { GpuInfo } from './types';

/**
 * How full a card is, as its bar and its node's total show it. A viewer who
 * may list every pod on the node sees the sum of what those pods booked; one
 * who may not gets the scheduler's per-card totals, which count every tenant's
 * pods without naming them.
 */
export function cardUsage(gpu: GpuInfo): { usedMem: number; shareCount: number } {
	if (gpu.allocatedTotal) return { ...gpu.allocatedTotal };
	return {
		usedMem: gpu.allocatedBy.reduce((sum, a) => sum + a.usedMem, 0),
		shareCount: gpu.allocatedBy.length
	};
}

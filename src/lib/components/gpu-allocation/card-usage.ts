import type { GpuInfo } from './types';

/**
 * How full a card is, as its bar and its node's total show it. A cluster admin
 * lists every pod on the node and sees the sum of what those pods booked;
 * everyone else gets the scheduler's per-card totals, which count every
 * tenant's pods without naming them.
 */
export function cardUsage(gpu: GpuInfo): { usedMem: number; shareCount: number } {
	if (gpu.allocatedTotal) return { ...gpu.allocatedTotal };
	return {
		usedMem: gpu.allocatedBy.reduce((sum, a) => sum + a.usedMem, 0),
		shareCount: gpu.allocatedBy.length
	};
}

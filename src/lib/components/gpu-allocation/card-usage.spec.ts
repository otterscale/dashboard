import { describe, expect, it } from 'vitest';

import { cardUsage } from './card-usage';
import type { GpuInfo } from './types';

const device = {
	id: 'GPU-a',
	index: 0,
	count: 10,
	devcore: 100,
	devmem: 2048,
	type: 'NVIDIA',
	mode: 'hami-core',
	health: true
};
const pod = (podName: string, usedMem: number) => ({
	podName,
	podNamespace: 'ws-a',
	usedCores: 10,
	usedMem
});

describe('cardUsage', () => {
	it('sums the pods the viewer could list', () => {
		const gpu: GpuInfo = { device, nodeName: 'n1', allocatedBy: [pod('a', 256), pod('b', 512)] };
		expect(cardUsage(gpu)).toEqual({ usedMem: 768, shareCount: 2 });
	});

	it("prefers the scheduler's per-card totals, which count every tenant", () => {
		const gpu: GpuInfo = {
			device,
			nodeName: 'n1',
			allocatedBy: [pod('a', 256)],
			allocatedTotal: { usedMem: 1024, shareCount: 3 }
		};
		expect(cardUsage(gpu)).toEqual({ usedMem: 1024, shareCount: 3 });
	});
});

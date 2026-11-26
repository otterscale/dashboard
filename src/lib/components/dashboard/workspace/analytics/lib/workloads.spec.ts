import { describe, expect, it } from 'vitest';

import { gpuAllocations } from './workloads';

const MIB = 1024 ** 2;
const pod = (name: string, phase: string, annotation?: string) => ({
	metadata: {
		name,
		annotations: annotation ? { 'hami.io/vgpu-devices-allocated': annotation } : undefined
	},
	status: { phase }
});

describe('gpuAllocations', () => {
	it("reads each live pod's bookings from its annotation", () => {
		const out = gpuAllocations([
			pod('qwen', 'Running', 'GPU-a,NVIDIA,97887,100:;'),
			pod('two', 'Pending', 'GPU-a,NVIDIA,1000,50:GPU-b,NVIDIA,2000,50:;'),
			pod('router', 'Running'),
			pod('job', 'Succeeded', 'GPU-c,NVIDIA,500,100:;')
		]);
		expect([...out.keys()]).toEqual(['qwen', 'two']);
		expect(out.get('qwen')).toEqual([{ uuid: 'GPU-a', bytes: 97887 * MIB }]);
		expect(out.get('two')).toEqual([
			{ uuid: 'GPU-a', bytes: 1000 * MIB },
			{ uuid: 'GPU-b', bytes: 2000 * MIB }
		]);
	});
});

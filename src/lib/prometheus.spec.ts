import { describe, expect, it } from 'vitest';

import { classifyGpuGovernance } from './prometheus';

const GIB = 1024 * 1024 * 1024;
const MIB = 1024 * 1024;

describe('classifyGpuGovernance', () => {
	it('stays quiet when either side is missing', () => {
		// No HAMi: nothing booked the card, which is not the same as booking zero.
		expect(classifyGpuGovernance(undefined, 5 * GIB)).toEqual({ level: 'managed' });
		// No DCGM: nothing to compare the booking against.
		expect(classifyGpuGovernance(8 * GIB, undefined)).toEqual({ level: 'managed' });
		expect(classifyGpuGovernance(NaN, 5 * GIB)).toEqual({ level: 'managed' });
	});

	it('reports usage above the booking as unmanaged', () => {
		// A pod that escaped HAMi (NVIDIA_VISIBLE_DEVICES=all) shows up on the card but not in
		// the scheduler's books.
		expect(classifyGpuGovernance(0, 5 * GIB)).toEqual({ level: 'unmanaged', bytes: 5 * GIB });
		expect(classifyGpuGovernance(2 * GIB, 6 * GIB)).toEqual({
			level: 'unmanaged',
			bytes: 4 * GIB
		});
	});

	it('ignores a small excess as rounding noise', () => {
		// DCGM reports whole MiB and HAMi books whole MB, so the two never agree exactly.
		expect(classifyGpuGovernance(8 * GIB, 8 * GIB + 100 * MIB)).toEqual({ level: 'managed' });
	});

	it('reports a large booking with little usage as idle', () => {
		expect(classifyGpuGovernance(8 * GIB, 1 * MIB)).toEqual({
			level: 'idle',
			bytes: 8 * GIB - MIB
		});
	});

	it('does not call a sub-GiB idle gap a finding', () => {
		expect(classifyGpuGovernance(8 * GIB, 7.5 * GIB)).toEqual({ level: 'managed' });
	});

	it('classifies the observed dev-cluster reading as idle', () => {
		// 7.81 GiB booked by a kserve pod, 1 MiB actually resident on the card.
		const governance = classifyGpuGovernance(8_388_608_000, 1_048_576);
		expect(governance.level).toBe('idle');
		expect(governance).toHaveProperty('bytes', 8_388_608_000 - 1_048_576);
	});
});

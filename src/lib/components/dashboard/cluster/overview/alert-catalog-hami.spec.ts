import { describe, expect, it } from 'vitest';

import { describeAlert, isCatalogued } from './alert-catalog';

describe('HAMi GPU memory alerts', () => {
	it('catalogues both platform rules', () => {
		expect(isCatalogued('HAMiGPUMemoryUsedBeyondAllocation')).toBe(true);
		expect(isCatalogued('HAMiGPUMemoryOverAllocated')).toBe(true);
	});

	it('fills the card and the figures from the rule’s labels', () => {
		const { title, description } = describeAlert({
			name: 'HAMiGPUMemoryUsedBeyondAllocation',
			severity: 'warning',
			labels: { node: 'gpu-01', device: 'nvidia3', used: '41.2', alloc: '36', diff: '5.2' }
		});
		expect(title).toContain('gpu-01 nvidia3');
		expect(description).toContain('41.2');
		expect(description).toContain('5.2');
	});
});

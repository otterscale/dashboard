import { describe, expect, it } from 'vitest';

import { squarify } from './treemap';
import { WorkspacePalette } from './workspaces';

describe('squarify', () => {
	const box = { x: 0, y: 0, w: 600, h: 400 };

	it('gives each value an area in proportion to it', () => {
		const values = [6, 6, 4, 3, 2, 2, 1];
		const rects = squarify(values, box);
		const total = values.reduce((a, b) => a + b, 0);
		rects.forEach((r, i) => {
			expect(r.w * r.h).toBeCloseTo((values[i] / total) * box.w * box.h, 6);
		});
	});

	it('stays inside the box', () => {
		for (const r of squarify([5, 3, 2, 1, 1], box)) {
			expect(r.x).toBeGreaterThanOrEqual(-1e-9);
			expect(r.y).toBeGreaterThanOrEqual(-1e-9);
			expect(r.x + r.w).toBeLessThanOrEqual(box.w + 1e-9);
			expect(r.y + r.h).toBeLessThanOrEqual(box.h + 1e-9);
		}
	});

	it('leaves zero values empty and keeps the output aligned with the input', () => {
		const rects = squarify([3, 0, 1], box);
		expect(rects).toHaveLength(3);
		expect(rects[1].w * rects[1].h).toBe(0);
	});

	it('returns empty rectangles when there is nothing to draw', () => {
		expect(squarify([0, 0], box).every((r) => r.w === 0)).toBe(true);
	});
});

describe('WorkspacePalette', () => {
	const palette = new WorkspacePalette({
		'ns-e': 'echo',
		'ns-a': 'alpha',
		'ns-c': 'charlie',
		'ns-b': 'bravo',
		'ns-d': 'delta'
	});

	it('colours workspaces by sorted name, whatever the order they arrive in', () => {
		expect(palette.groupOf('ns-a').color).toBe('var(--chart-6)');
		expect(palette.groupOf('ns-d').color).toBe('var(--chart-9)');
	});

	it('folds the fifth workspace onwards into Other workspaces', () => {
		expect(palette.groupOf('ns-e').id).toBe('__other__');
	});

	it('puts namespaces outside every workspace in System namespaces', () => {
		expect(palette.groupOf('kube-system').id).toBe('__system__');
	});
});

import { describe, expect, it } from 'vitest';

import { modelColors } from './models';
import { rangeKeys, sparkValues, trendLines } from './trend';

const range = (key: string, values: number[]) => ({
	key,
	points: values.map((value, i) => ({ time: i * 60_000, value }))
});

describe('trendLines', () => {
	it('keeps each model in its own colour whatever order the data arrives in', () => {
		const ranges = [range('n/b', [1, 2]), range('n/a', [3, 4])];
		const colors = modelColors(ranges.map((r) => r.key));
		const { series, points } = trendLines(ranges, colors, 'sum');
		expect(series).toEqual([
			{ key: 's0', label: 'a', color: 'var(--chart-6)' },
			{ key: 's1', label: 'b', color: 'var(--chart-7)' }
		]);
		expect(points[1]).toMatchObject({ s0: 4, s1: 2 });
	});

	it("draws only the coloured models, adding up or taking the worst of one model's series", () => {
		const ranges = [range('n/a', [1, 90]), range('n/a', [2, 95]), range('n/z', [7, 7])];
		const colors = modelColors(['n/a']);
		expect(trendLines(ranges, colors, 'sum').series).toHaveLength(1);
		expect(trendLines(ranges, colors, 'sum').points[0].s0).toBe(3);
		expect(trendLines(ranges, colors, 'max').points[1].s0).toBe(95);
	});

	it('lists each model with a series once', () => {
		expect(
			rangeKeys([range('n/a', [1])], undefined, [range('n/a', [2]), range('n/b', [1])])
		).toEqual(['n/a', 'n/b']);
	});

	it('names a standalone model by its model name', () => {
		const ranges = [range('n/standalone:bge-m3', [1])];
		const { series } = trendLines(ranges, modelColors(['n/standalone:bge-m3']), 'sum');
		expect(series[0].label).toBe('bge-m3');
	});
});

describe('sparkValues', () => {
	it('adds the series of one model together', () => {
		const s = sparkValues([range('n/a', [1, 2]), range('n/a', [3, 4]), range('n/b', [5])]);
		expect(s.get('n/a')).toEqual([4, 6]);
		expect(s.get('n/b')).toEqual([5]);
	});
});

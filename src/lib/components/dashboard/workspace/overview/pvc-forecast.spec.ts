import { describe, expect, it } from 'vitest';

import { daysUntilFull, fillingFirst } from './pvc-forecast';

const GIB = 1024 ** 3;

describe('daysUntilFull', () => {
	it('divides the free space by the daily growth', () => {
		expect(daysUntilFull(100 * GIB, 76 * GIB, 2 * GIB)).toBe(12);
	});

	it('is null for a volume growing less than 0.1 GiB a day, or shrinking', () => {
		expect(daysUntilFull(100 * GIB, 50 * GIB, 0.09 * GIB)).toBeNull();
		expect(daysUntilFull(100 * GIB, 50 * GIB, -1 * GIB)).toBeNull();
	});

	it('counts at least one day while there is room', () => {
		expect(daysUntilFull(100 * GIB, 99.9 * GIB, 10 * GIB)).toBe(1);
	});

	it('is 0 for a full volume, whatever its growth', () => {
		expect(daysUntilFull(100 * GIB, 100 * GIB, 0)).toBe(0);
	});

	it('is null without a capacity or with a value that is not a number', () => {
		expect(daysUntilFull(0, 0, GIB)).toBeNull();
		expect(daysUntilFull(100 * GIB, Number.NaN, GIB)).toBeNull();
	});
});

describe('fillingFirst', () => {
	const volume = (name: string, usedGiB: number, growthGiB: number | null) => ({
		name,
		capacity: 100 * GIB,
		used: usedGiB * GIB,
		growthPerDay: growthGiB === null ? null : growthGiB * GIB
	});

	it('puts forecasts inside 30 days first, soonest first, then the fullest', () => {
		const rows = fillingFirst([
			volume('flat-full', 95, 0),
			volume('slow', 10, 2), // 45 days: not soon
			volume('soon', 50, 5), // 10 days
			volume('sooner', 80, 5), // 4 days
			volume('half', 50, null)
		]);
		expect(rows.map((row) => [row.name, row.fullInDays])).toEqual([
			['sooner', 4],
			['soon', 10],
			['flat-full', null]
		]);
	});

	it('reports the share used', () => {
		expect(fillingFirst([volume('a', 41, null)])[0]?.percent).toBeCloseTo(41);
	});

	it('skips a volume without a capacity', () => {
		expect(fillingFirst([{ name: 'x', capacity: 0, used: 0, growthPerDay: null }])).toEqual([]);
	});
});

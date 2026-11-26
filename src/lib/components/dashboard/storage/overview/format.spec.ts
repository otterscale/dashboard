import { describe, expect, it } from 'vitest';

import { fmtBytes, fmtPct, niceTop } from './format';

describe('niceTop', () => {
	it('rounds the axis top up so its half is round too', () => {
		expect(niceTop(7)).toBe(10);
		expect(niceTop(2.04)).toBe(4);
		expect(niceTop(301_000)).toBe(400_000);
		expect(niceTop(0)).toBe(1);
	});
});

describe('fmtBytes', () => {
	it('shows binary units with three significant digits', () => {
		expect(fmtBytes(302_808_246_863)).toBe('282 GiB');
		expect(fmtBytes(6_993_212_342_272)).toBe('6.36 TiB');
		expect(fmtBytes(10_030_012)).toBe('9.57 MiB');
		expect(fmtBytes(undefined)).toBe('—');
	});
});

describe('fmtPct', () => {
	it('keeps a sliver from reading as 0', () => {
		expect(fmtPct(3.96)).toBe('4.0%');
		expect(fmtPct(0.0014)).toBe('0.00%');
		expect(fmtPct(14.6)).toBe('15%');
	});
});

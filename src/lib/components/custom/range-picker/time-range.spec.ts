import { describe, expect, it } from 'vitest';

import {
	formatSpan,
	onDay,
	rangeFromParams,
	rangeToParams,
	resolveRange,
	shiftRange,
	toNow,
	withLength
} from './time-range';

const H = 3_600_000;
const now = new Date(2026, 10, 24, 17, 4).getTime();

describe('resolveRange', () => {
	it('ends a relative range at its anchor', () => {
		expect(resolveRange({ kind: 'relative', minutes: 60 }, now)).toEqual({
			start: now - H,
			end: now
		});
	});
});

describe('shiftRange', () => {
	it('moves back by the window’s length and fixes it', () => {
		expect(shiftRange({ kind: 'relative', minutes: 60 }, now, -1, now)).toEqual({
			kind: 'absolute',
			from: now - 2 * H,
			to: now - H
		});
	});

	it('turns back into "the last N minutes" when moving forward reaches now', () => {
		expect(shiftRange({ kind: 'absolute', from: now - 2 * H, to: now - H }, now, 1, now)).toEqual({
			kind: 'relative',
			minutes: 60
		});
	});
});

describe('URL params', () => {
	it('round-trips both kinds', () => {
		for (const range of [
			{ kind: 'relative', minutes: 180 } as const,
			{ kind: 'absolute', from: now - H, to: now } as const
		]) {
			expect(rangeFromParams(new URLSearchParams(rangeToParams(range)))).toEqual(range);
		}
	});

	it('falls back to the last hour for anything it cannot read', () => {
		expect(rangeFromParams(new URLSearchParams('from=9&to=3'))).toEqual({
			kind: 'relative',
			minutes: 60
		});
	});
});

describe('withLength', () => {
	it('keeps "now" for a quick range and the end for a fixed one', () => {
		expect(withLength({ kind: 'relative', minutes: 60 }, 180)).toEqual({
			kind: 'relative',
			minutes: 180
		});
		expect(withLength({ kind: 'absolute', from: now - H, to: now }, 180)).toEqual({
			kind: 'absolute',
			from: now - 3 * H,
			to: now
		});
	});
});

describe('toNow', () => {
	it('keeps the length and ends now', () => {
		expect(toNow({ kind: 'absolute', from: 0, to: 3_600_000 })).toEqual({
			kind: 'relative',
			minutes: 60
		});
		expect(toNow({ kind: 'relative', minutes: 15 })).toEqual({ kind: 'relative', minutes: 15 });
	});
});

describe('onDay', () => {
	const day = (d: number) => new Date(2026, 10, d).getTime();

	it('ends a past day’s window at its midnight, keeping the length', () => {
		expect(onDay({ kind: 'relative', minutes: 1440 }, day(21), now)).toEqual({
			kind: 'absolute',
			from: day(21),
			to: day(22)
		});
	});

	it('goes back to "the last N" for today', () => {
		expect(onDay({ kind: 'absolute', from: day(20), to: day(20) + H }, day(24), now)).toEqual({
			kind: 'relative',
			minutes: 60
		});
	});
});

describe('formatSpan', () => {
	it('shows only times for today and adds dates otherwise', () => {
		expect(formatSpan(now - H, now, now)).toBe('16:04 – 17:04');
		expect(formatSpan(now - 25 * H, now - 24 * H, now)).toBe('11/23 16:04 – 17:04');
		expect(formatSpan(now - 20 * H, now, now)).toBe('11/23 21:04 – 11/24 17:04');
	});
});

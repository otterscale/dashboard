import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AutoRefresh } from './auto-refresh.svelte';

describe('AutoRefresh', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});
	afterEach(() => vi.useRealTimers());

	it('marks an update every interval while live', () => {
		const clock = new AutoRefresh(10_000);
		const stop = clock.run(true);
		expect(clock.updatedAt).toBe(0);
		vi.advanceTimersByTime(10_000);
		expect(clock.tick).toBe(1);
		expect(clock.updatedAt).toBe(10_000);
		stop();
		vi.advanceTimersByTime(30_000);
		expect(clock.tick).toBe(1);
	});

	it('keeps the last update while paused', () => {
		const clock = new AutoRefresh(10_000);
		clock.run(true);
		vi.advanceTimersByTime(4_000);
		clock.run(false);
		vi.advanceTimersByTime(60_000);
		expect(clock.updatedAt).toBe(0);
		expect(clock.tick).toBe(0);
	});

	it('counts the interval from a manual update', () => {
		const clock = new AutoRefresh(10_000);
		clock.run(true);
		vi.advanceTimersByTime(7_000);
		clock.mark();
		expect(clock.tick).toBe(1);
		expect(clock.updatedAt).toBe(7_000);
		vi.advanceTimersByTime(3_000);
		expect(clock.tick).toBe(1);
		vi.advanceTimersByTime(7_000);
		expect(clock.tick).toBe(2);
		expect(clock.updatedAt).toBe(17_000);
	});

	it('marks a manual update while paused without starting the interval', () => {
		const clock = new AutoRefresh(10_000);
		clock.run(false);
		vi.advanceTimersByTime(5_000);
		clock.mark();
		expect(clock.updatedAt).toBe(5_000);
		vi.advanceTimersByTime(30_000);
		expect(clock.tick).toBe(1);
	});
});

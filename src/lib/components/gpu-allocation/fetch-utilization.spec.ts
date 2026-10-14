import type { QueryResult } from 'prometheus-query';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SharedMetrics, SharedParams, SharedQueryName } from '$lib/prometheus';

import { fetchGpuAllocatedTotals, fetchGpuUtilization } from './fetch-utilization';

type Answers = Partial<Record<SharedQueryName, [Record<string, string>, number][]>>;
type Call = { name: SharedQueryName; params?: SharedParams };

/** A shared client that answers by name; a name without an answer fails like an old server's 404. */
function fakeShared(answers: Answers, calls: Call[] = []): SharedMetrics {
	return {
		instant: async (name, params) => {
			calls.push({ name, params });
			const series = answers[name];
			if (!series) throw new Error(`${name}: HTTP 404`);
			return {
				resultType: 'vector',
				result: series.map(([labels, value]) => ({
					metric: { labels },
					value: { time: new Date(0), value }
				}))
			} as unknown as QueryResult;
		},
		range: async () => {
			throw new Error('not used');
		}
	};
}

afterEach(() => vi.restoreAllMocks());

describe('fetchGpuUtilization', () => {
	it('asks the shared scope per card, once per measure', async () => {
		const calls: Call[] = [];
		const shared = fakeShared(
			{
				'gpu-util': [[{ UUID: 'GPU-a' }, 40]],
				'gpu-fb-used': [[{ UUID: 'GPU-a' }, 1024]],
				'gpu-fb-total': [[{ UUID: 'GPU-a' }, 2048]]
			},
			calls
		);
		const result = await fetchGpuUtilization(shared, ['GPU-a', 'GPU-a', 'GPU-b', 'not a uuid!']);

		expect(calls.map((c) => c.name).sort()).toEqual(['gpu-fb-total', 'gpu-fb-used', 'gpu-util']);
		for (const c of calls) expect(c.params).toEqual({ uuid: ['GPU-a', 'GPU-b'] });
		expect(result.get('GPU-a')).toEqual({ compute: 40, usedMem: 1024, totalMem: 2048 });
		expect(result.has('GPU-b')).toBe(false);
	});

	it('splits more than 256 cards into requests the server accepts', async () => {
		const calls: Call[] = [];
		const ids = Array.from({ length: 300 }, (_, i) => `GPU-${i}`);
		await fetchGpuUtilization(
			fakeShared({ 'gpu-util': [], 'gpu-fb-used': [], 'gpu-fb-total': [] }, calls),
			ids
		);

		expect(calls).toHaveLength(6);
		for (const c of calls) expect(c.params?.uuid?.length).toBeLessThanOrEqual(256);
		const asked = calls.filter((c) => c.name === 'gpu-util').flatMap((c) => c.params?.uuid ?? []);
		expect(asked.sort()).toEqual([...ids].sort());
	});

	it('leaves cards unmeasured when the shared scope fails, without throwing', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(fetchGpuUtilization(fakeShared({}), ['GPU-a'])).resolves.toEqual(new Map());
		expect(warn).toHaveBeenCalled();
	});
});

describe('fetchGpuAllocatedTotals', () => {
	it('turns hami-scheduler bytes into MiB, with the share count', async () => {
		const totals = await fetchGpuAllocatedTotals(
			fakeShared({
				'gpu-allocated-memory': [
					[{ device_uuid: 'GPU-a' }, 268435456],
					[{ device_uuid: 'GPU-b' }, 0]
				],
				'gpu-shared-count': [[{ device_uuid: 'GPU-a' }, 2]]
			})
		);
		expect(totals.get('GPU-a')).toEqual({ usedMem: 256, shareCount: 2 });
		expect(totals.get('GPU-b')).toEqual({ usedMem: 0, shareCount: 0 });
	});

	it('is empty when the shared scope fails, without throwing', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		await expect(fetchGpuAllocatedTotals(fakeShared({}))).resolves.toEqual(new Map());
		expect(warn).toHaveBeenCalled();
	});
});

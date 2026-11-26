import { describe, expect, it } from 'vitest';

import { GIB, MIB } from '$lib/components/dashboard/kit/format';

import { buildGpuCards, cardItems, cardsPerPod, gpuGrid } from './gpu-cards';

const card = (uuid: string, used: number, index = 0) => ({
	uuid,
	device: `nvidia${index}`,
	index,
	model: 'NVIDIA RTX PRO 6000 Blackwell Server Edition',
	capacity: 95.59 * GIB,
	used
});

describe('buildGpuCards', () => {
	it('reads nothing outside HAMi when tracked use covers the card (it counts the reserve too)', () => {
		// The qwen card on the dev cluster: DCGM 84.50 GiB used, HAMi tracked 85.12 GiB.
		const [c] = buildGpuCards(
			[card('a', 84.5 * GIB)],
			[{ namespace: 'db', pod: 'qwen', uuid: 'a', bytes: 95.59 * GIB }],
			[{ namespace: 'db', pod: 'qwen', uuid: 'a', bytes: 85.12 * GIB }]
		);
		expect(c.outside).toBe(0);
		expect(c.unreported).toEqual([]);
	});

	it('treats an idle card’s few MiB as rounding, not use outside HAMi', () => {
		const [c] = buildGpuCards([card('a', 13 * MIB)], [], []);
		expect(c.outside).toBe(0);
	});

	it('reports the gap when DCGM sees more than HAMi tracked', () => {
		const [c] = buildGpuCards(
			[card('a', 72.78 * GIB)],
			[{ namespace: 'ns', pod: 'p', uuid: 'a', bytes: 2 * GIB }],
			[{ namespace: 'ns', pod: 'p', uuid: 'a', bytes: 1.8 * GIB }]
		);
		expect(c.outside! / GIB).toBeCloseTo(70.98, 2);
	});

	it('does not call a silent pod’s use "outside HAMi"', () => {
		const [c] = buildGpuCards(
			[card('a', 40 * GIB)],
			[{ namespace: 'ns', pod: 'quiet', uuid: 'a', bytes: 45 * GIB }],
			[]
		);
		expect(c.outside).toBeUndefined();
		expect(c.unreported).toEqual(['quiet']);
		expect(c.unattributed).toBe(40 * GIB);
	});
});

describe('cardItems', () => {
	it('fills the rest of an allocated card with unallocated space', () => {
		const [c] = buildGpuCards(
			[card('a', 0)],
			[{ namespace: 'ns', pod: 'p', uuid: 'a', bytes: 24 * GIB }],
			[]
		);
		const items = cardItems(c, 'allocated');
		expect(items.map((i) => i.kind)).toEqual(['pod', 'free']);
		expect(items[1].value / GIB).toBeCloseTo(71.59, 2);
	});

	it('draws no unallocated space on an over-allocated card', () => {
		const [c] = buildGpuCards(
			[card('a', 0)],
			[
				{ namespace: 'ns', pod: 'p', uuid: 'a', bytes: 60 * GIB },
				{ namespace: 'ns', pod: 'q', uuid: 'a', bytes: 40 * GIB }
			],
			[]
		);
		expect(cardItems(c, 'allocated').some((i) => i.kind === 'free')).toBe(false);
	});

	it('frees only what DCGM says is free in usage mode', () => {
		const [c] = buildGpuCards(
			[card('a', 72.78 * GIB)],
			[{ namespace: 'ns', pod: 'p', uuid: 'a', bytes: 2 * GIB }],
			[{ namespace: 'ns', pod: 'p', uuid: 'a', bytes: 1.8 * GIB }]
		);
		const items = cardItems(c, 'usage');
		expect(items.map((i) => i.kind)).toEqual(['outside', 'pod', 'free']);
		expect(items[2].value / GIB).toBeCloseTo(95.59 - 72.78, 2);
	});
});

describe('cardsPerPod', () => {
	it('counts distinct cards per pod', () => {
		const counts = cardsPerPod([
			{ namespace: 'ns', pod: 'p', uuid: 'a', bytes: 1 },
			{ namespace: 'ns', pod: 'p', uuid: 'b', bytes: 1 },
			{ namespace: 'ns', pod: 'q', uuid: 'a', bytes: 1 }
		]);
		expect(counts.get('ns/p')).toBe(2);
		expect(counts.get('ns/q')).toBe(1);
	});
});

describe('gpuGrid', () => {
	it('puts up to four cards in one tall row and more in rows of four', () => {
		expect(gpuGrid(4)).toEqual({ columns: 4, height: 316 });
		expect(gpuGrid(8)).toEqual({ columns: 4, height: 150 });
		expect(gpuGrid(16).columns).toBe(4);
	});
});

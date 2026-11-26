import { describe, expect, it } from 'vitest';

import { gpuMemory } from './gpu-memory';

const MIB = 1024 ** 2;

function pod(phase: string, annotation?: string) {
	const annotations: Record<string, string> = {};
	if (annotation) annotations['hami.io/vgpu-devices-allocated'] = annotation;
	return { metadata: { annotations }, status: { phase } };
}

describe('gpuMemory', () => {
	it('adds up what the scheduler booked on each live pod, and counts the cards', () => {
		const result = gpuMemory(
			[
				pod('Running', 'GPU-a,NVIDIA,97888,100:;'),
				pod('Pending', 'GPU-b,NVIDIA,97888,100:;'),
				pod('Running', 'GPU-c,NVIDIA,48944,50:;'),
				pod('Running')
			],
			new Map([
				['GPU-a', 91399127040],
				['GPU-b', 680394752],
				['GPU-c', 0]
			]),
			new Map([
				['GPU-a', 1],
				['GPU-b', 1],
				['GPU-c', 1]
			])
		);
		expect(result).toEqual({
			allocated: (97888 + 97888 + 48944) * MIB,
			cards: 3,
			used: 91399127040 + 680394752,
			sharedCards: 0
		});
	});

	it('leaves out finished pods', () => {
		expect(
			gpuMemory([pod('Succeeded', 'GPU-a,NVIDIA,1024,100:;')], new Map(), new Map()).allocated
		).toBe(0);
	});

	it('counts usage only on cards the namespace has to itself', () => {
		const result = gpuMemory(
			[pod('Running', 'GPU-a,NVIDIA,1024,50:;'), pod('Running', 'GPU-b,NVIDIA,1024,50:;')],
			new Map([
				['GPU-a', 100],
				['GPU-b', 200]
			]),
			new Map([
				['GPU-a', 1],
				['GPU-b', 2]
			])
		);
		expect(result).toMatchObject({ used: 100, sharedCards: 1 });
	});

	it('has no usage when no card reports any', () => {
		expect(
			gpuMemory([pod('Running', 'GPU-a,NVIDIA,1024,50:;')], new Map(), new Map()).used
		).toBeNull();
	});

	it('counts a card once when two containers book it', () => {
		expect(
			gpuMemory(
				[pod('Running', 'GPU-a,NVIDIA,1024,50:;GPU-a,NVIDIA,1024,50:')],
				new Map(),
				new Map()
			)
		).toMatchObject({ allocated: 2048 * MIB, cards: 1 });
	});
});

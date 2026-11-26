import { describe, expect, it } from 'vitest';

import { type PodSignalInput, podSignals } from './pod-signals';

const empty: PodSignalInput = {
	phases: [],
	notReady: [],
	waiting: [],
	crashLooping: [],
	oomLastExit: [],
	oomRecent: [],
	restarts: []
};

describe('podSignals', () => {
	// db286l on 2026-11-26: kjhk crash-loops, muse's init container crash-loops after OOM kills.
	const db286l: PodSignalInput = {
		phases: [
			{ pod: 'qwen-0', phase: 'Running' },
			{ pod: 'qwen-router', phase: 'Running' },
			{ pod: 'kjhk-0', phase: 'Running' },
			{ pod: 'kjhk-router', phase: 'Running' },
			{ pod: 'muse-router', phase: 'Running' },
			{ pod: 'muse-0', phase: 'Pending' },
			{ pod: 'download', phase: 'Succeeded' }
		],
		notReady: ['muse-0', 'kjhk-0'],
		waiting: [
			{ pod: 'kjhk-0', reason: 'CrashLoopBackOff' },
			{ pod: 'muse-0', reason: 'PodInitializing' },
			{ pod: 'muse-0', reason: 'CrashLoopBackOff' }
		],
		crashLooping: ['kjhk-0', 'muse-0'],
		oomLastExit: ['muse-0'],
		oomRecent: ['muse-0'],
		restarts: [
			{ pod: 'kjhk-0', count: 234.4 },
			{ pod: 'muse-0', count: 269.1 },
			{ pod: 'qwen-0', count: 0.2 }
		]
	};

	it('counts each failing pod once for Pods needing attention', () => {
		expect(podSignals(db286l).attention).toEqual({ value: 2, names: ['kjhk-0', 'muse-0'] });
	});

	it('counts pods by phase', () => {
		const s = podSignals(db286l);
		expect([s.running.value, s.pending.value, s.unknown.value, s.succeeded.value]).toEqual([
			5, 1, 0, 1
		]);
		expect(s.pending.names).toEqual(['muse-0']);
	});

	it('counts a pod crash-looping between back-offs as CrashLoopBackOff', () => {
		const s = podSignals({ ...db286l, waiting: [] });
		expect(s.crashLoop).toEqual({ value: 2, names: ['kjhk-0', 'muse-0'] });
		expect(s.attention.value).toBe(2);
	});

	it('adds ErrImagePull to ImagePullBackOff and ignores waiting reasons that pass on their own', () => {
		const s = podSignals({
			...empty,
			waiting: [
				{ pod: 'a', reason: 'ErrImagePull' },
				{ pod: 'b', reason: 'ImagePullBackOff' },
				{ pod: 'c', reason: 'ContainerCreating' }
			]
		});
		expect(s.imagePull.value).toBe(2);
		expect(s.attention.names).toEqual(['a', 'b']);
	});

	it('sums restarts over the pods that restarted, rounding what increase() extrapolates', () => {
		expect(podSignals(db286l).restarts).toEqual({ value: 503, names: ['kjhk-0', 'muse-0'] });
	});

	it('takes an OOM kill as failing only within the hour, but shows any as the last exit', () => {
		const s = podSignals({ ...empty, oomLastExit: ['old', 'new'], oomRecent: ['new'] });
		expect(s.oomKilled.value).toBe(2);
		expect(s.attention.names).toEqual(['new']);
	});

	it('takes a Failed pod as failing', () => {
		expect(podSignals({ ...empty, phases: [{ pod: 'f', phase: 'Failed' }] }).attention.value).toBe(
			1
		);
	});
});

/**
 * The Pod & rollout card's counts, from per-pod Prometheus answers. Each count keeps the names
 * behind it, for the tooltip and the link.
 */

import { FAILING_WAIT_REASONS } from './workload-status';

/** A pod's current waiting reason, from a container or an init container. */
export type Waiting = { pod: string; reason: string };

export type PodSignalInput = {
	/** Pods by phase, `kube_pod_status_phase == 1`. */
	phases: { pod: string; phase: string }[];
	notReady: string[];
	waiting: Waiting[];
	/** Crashed within 10 minutes after restarting before: crash-looping between back-offs. */
	crashLooping: string[];
	/** Last exit was an OOM kill, at any time. */
	oomLastExit: string[];
	/** OOM-killed within the last hour. */
	oomRecent: string[];
	/** Restarts in 24 h per pod, containers and init containers together. */
	restarts: { pod: string; count: number }[];
};

export type Count = { value: number; names: string[] };

export type PodSignals = {
	attention: Count;
	running: Count;
	pending: Count;
	unknown: Count;
	succeeded: Count;
	notReady: Count;
	crashLoop: Count;
	imagePull: Count;
	configError: Count;
	oomKilled: Count;
	restarts: Count;
};

function count(names: Iterable<string>): Count {
	const unique = [...new Set(names)].sort();
	return { value: unique.length, names: unique };
}

const FAILING = new Set<string>(FAILING_WAIT_REASONS);

export function podSignals(input: PodSignalInput): PodSignals {
	const inPhase = (phase: string) =>
		input.phases.filter((p) => p.phase === phase).map((p) => p.pod);
	const waitingOn = (...reasons: string[]) =>
		input.waiting.filter((w) => reasons.includes(w.reason)).map((w) => w.pod);
	const restarted = input.restarts.filter((r) => Math.round(r.count) > 0);

	// The pods the Workload health card calls failing: a failing waiting reason, a crash loop,
	// an OOM kill in the last hour, or a Failed phase.
	const attention = count([
		...input.waiting.filter((w) => FAILING.has(w.reason)).map((w) => w.pod),
		...input.crashLooping,
		...input.oomRecent,
		...inPhase('Failed')
	]);

	return {
		attention,
		running: count(inPhase('Running')),
		pending: count(inPhase('Pending')),
		unknown: count(inPhase('Unknown')),
		succeeded: count(inPhase('Succeeded')),
		notReady: count(input.notReady),
		crashLoop: count([...waitingOn('CrashLoopBackOff'), ...input.crashLooping]),
		imagePull: count(waitingOn('ImagePullBackOff', 'ErrImagePull')),
		configError: count(waitingOn('CreateContainerConfigError')),
		oomKilled: count(input.oomLastExit),
		restarts: {
			value: restarted.reduce((sum, r) => sum + Math.round(r.count), 0),
			names: restarted.map((r) => r.pod).sort()
		}
	};
}

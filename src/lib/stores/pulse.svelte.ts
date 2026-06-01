/**
 * Resource pulses — module-scope reactive timestamps that act as refetch triggers.
 *
 * The number stored is a monotonically-increasing millisecond timestamp. It
 * normally tracks Date.now(), but is bumped by +1 when bumps happen within
 * the same millisecond, so Svelte's identity-based reactivity always fires.
 *
 * Usage:
 *   // Subscriber
 *   $effect(() => {
 *     pulse.workspaces;          // subscribe; bump() retriggers
 *     // ...refetch
 *   });
 *
 *   // After a mutation
 *   await client.create(...);
 *   bump('workspaces');
 *
 * Cross-tab notification: enabled via BroadcastChannel when available.
 */

export type Subscribers = 'workspaces' | 'links';

const initial: Record<Subscribers, number> = {
	workspaces: 0,
	links: 0
};

export const pulse = $state<Record<Subscribers, number>>({ ...initial });

const CHANNEL_NAME = 'otterscale:resource-pulse';

const channel: BroadcastChannel | null =
	typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

/** Advance the pulse to at least `candidate`, guaranteeing strict monotonic increase. */
function advance(key: Subscribers, candidate: number): number {
	const next = candidate > pulse[key] ? candidate : pulse[key] + 1;
	pulse[key] = next;
	return next;
}

channel?.addEventListener('message', (e: MessageEvent<{ key: Subscribers; ts: number }>) => {
	const { key, ts } = e.data ?? {};
	if (key && key in pulse && typeof ts === 'number') {
		advance(key, ts);
	}
});

export function bump(key: Subscribers): void {
	const ts = advance(key, Date.now());
	channel?.postMessage({ key, ts });
}

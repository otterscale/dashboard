import { flushSync } from 'svelte';

/**
 * A page's update clock, for the refresh control's "3 s ago". While auto update is on it marks
 * an update every interval, in step with the widgets' own ReloadManagers (which restart when auto
 * update turns on), and bumps `tick` for cards that refetch on it.
 */
export class AutoRefresh {
	tick = $state(0);
	updatedAt = $state(Date.now());
	#timer: ReturnType<typeof setInterval> | undefined;

	constructor(private readonly intervalMs = 10_000) {}

	/** Start (live) or stop the interval; returns the stop function, for an `$effect`. */
	run(live: boolean): () => void {
		this.#clear();
		if (live) {
			this.updatedAt = Date.now();
			this.#start();
		}
		return () => this.#clear();
	}

	/** An update happened now (a manual one): bump `tick`, and count the interval from here. */
	mark() {
		this.tick += 1;
		this.updatedAt = Date.now();
		if (this.#timer !== undefined) {
			this.#clear();
			this.#start();
		}
	}

	#start() {
		this.#timer = setInterval(() => {
			this.tick += 1;
			this.updatedAt = Date.now();
		}, this.intervalMs);
	}

	#clear() {
		if (this.#timer !== undefined) clearInterval(this.#timer);
		this.#timer = undefined;
	}
}

/**
 * Make every widget that follows an `isReloading` flag fetch once now, leaving auto update as it
 * was. Those widgets restart their ReloadManager (which fetches at once) when the flag turns on
 * and stop it when it turns off, so flipping the flag and back does exactly one fetch each.
 * Call it from an event handler, not an effect.
 */
export function reloadNow(get: () => boolean, set: (value: boolean) => void) {
	const live = get();
	set(!live);
	flushSync();
	set(live);
}

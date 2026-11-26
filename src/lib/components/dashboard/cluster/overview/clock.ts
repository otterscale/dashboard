import { createSubscriber } from 'svelte/reactivity';

/**
 * The time now, for "firing for 3 min" labels. Whatever reads `now` reads it again every
 * interval, and the timer only runs while something on screen is reading.
 */
export class Clock {
	#subscribe: () => void;

	constructor(intervalMs = 15_000) {
		this.#subscribe = createSubscriber((update) => {
			const id = setInterval(update, intervalMs);
			return () => clearInterval(id);
		});
	}

	get now(): number {
		this.#subscribe();
		return Date.now();
	}
}

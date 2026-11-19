import { onDestroy, untrack } from 'svelte';

import { ReloadManager } from '$lib/components/custom/reloader';

/**
 * What a widget has to show:
 * - `loading`: nothing has come back yet.
 * - `ready`: there is data.
 * - `empty`: the query answered, with nothing in it.
 * - `error`: the query failed and there is nothing earlier to fall back on.
 */
export type LoadStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * One widget's data and the state it is in. `load` returns the data, `null` or
 * `undefined` when the answer is empty, and throws when the query failed.
 *
 * A failed refresh keeps the data already on screen and sets `stale`, so a
 * widget never drops to "no data" because of one bad request.
 */
export class Loadable<T> {
	data = $state<T | undefined>(undefined);
	status = $state<LoadStatus>('loading');
	stale = $state(false);

	#load: () => Promise<T | null | undefined>;
	#manager: ReloadManager;

	constructor(load: () => Promise<T | null | undefined>) {
		this.#load = load;
		this.#manager = new ReloadManager(() => void this.refresh());
	}

	refresh = async () => {
		try {
			const value = await this.#load();
			if (value === null || value === undefined) {
				this.data = undefined;
				this.status = 'empty';
			} else {
				this.data = value;
				this.status = 'ready';
			}
			this.stale = false;
		} catch (error) {
			console.error('Dashboard widget failed to load:', error);
			if (this.status === 'ready') this.stale = true;
			else this.status = 'error';
		}
	};

	restart() {
		this.#manager.restart();
	}

	stop() {
		this.#manager.stop();
	}
}

/**
 * A {@link Loadable} wired to the page's auto-update switch: refreshed every ten
 * seconds while `reloading()` is true, loaded once when it is not. Call during
 * component initialisation.
 */
export function useLoadable<T>(
	load: () => Promise<T | null | undefined>,
	reloading: () => boolean
): Loadable<T> {
	const loadable = new Loadable(load);
	$effect(() => {
		if (reloading()) {
			untrack(() => loadable.restart());
		} else {
			untrack(() => {
				loadable.stop();
				if (loadable.status === 'loading') void loadable.refresh();
			});
		}
	});
	onDestroy(() => loadable.stop());
	return loadable;
}

/** Thrown by a widget's `load` when a helper reports failure by returning `null`. */
export class QueryFailedError extends Error {
	constructor(what = 'query') {
		super(`${what} failed`);
		this.name = 'QueryFailedError';
	}
}

/** Unwraps a helper that returns `null` on failure, so the failure is not mistaken for no data. */
export function orThrow<T>(value: T | null, what?: string): T {
	if (value === null) throw new QueryFailedError(what);
	return value;
}

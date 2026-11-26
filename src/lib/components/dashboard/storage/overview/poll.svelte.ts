import type { PrometheusDriver } from 'prometheus-query';
import { untrack } from 'svelte';

import { ReloadManager } from '$lib/components/custom/reloader';
import { type WidgetState, widgetState } from '$lib/components/dashboard/kit';
import { fetchCombinedInstantOrNull } from '$lib/prometheus';

import type { Vectors } from './vectors';

/**
 * One card's instant queries, sent as a single request and repeated every 10 s while auto update
 * is on. Made while the card is created and sends nothing until `run` is called from an effect,
 * so the server renders the card in its loading state.
 */
export class InstantPoll {
	// Only ever replaced whole, so it is not made deeply reactive.
	data = $state.raw<Vectors | null>(null);
	loaded = $state(false);
	failed = $state(false);
	#manager: ReloadManager;
	#seq = 0;
	// The newest request whose answer is on screen.
	#applied = 0;

	constructor(
		private readonly client: () => PrometheusDriver,
		private readonly queries: Record<string, string>
	) {
		this.#manager = new ReloadManager(() => void this.fetch());
	}

	async fetch() {
		const seq = ++this.#seq;
		const result = await fetchCombinedInstantOrNull(this.client(), this.queries);
		// A slow answer must not replace a newer one already on screen (the health query looks
		// back 7 days and can outlast the 10 s interval).
		if (seq < this.#applied) return;
		this.#applied = seq;
		this.failed = result === null;
		// A failed refresh keeps the last answer on screen.
		if (result) this.data = result;
		this.loaded = true;
	}

	/** For an `$effect`: live polls (and fetches at once); otherwise fetch once if never loaded. */
	run(live: boolean): () => void {
		// Only `live` should re-run the caller's effect, not the answer arriving.
		untrack(() => {
			if (live) this.#manager.restart();
			else if (!this.loaded) void this.fetch();
		});
		return () => this.#manager.stop();
	}

	/** Loading, empty, error or ready, given whether the answer holds what the card needs. */
	state(hasData: (data: Vectors) => boolean): WidgetState {
		const has = this.data !== null && hasData(this.data);
		return widgetState(this.loaded, has, this.failed && !has);
	}
}

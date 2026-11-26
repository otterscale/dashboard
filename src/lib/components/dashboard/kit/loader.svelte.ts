import type { WidgetState } from './index';

/**
 * One card's data. `state` follows the dashboard kit: `loading` until the first answer, then
 * `ready`, `empty` (answered with nothing) or `error` (the request failed). A refresh that fails
 * keeps the last good answer on screen, the way the overview cards do.
 */
export class Loader<T> {
	state = $state<WidgetState>('loading');
	data = $state.raw<T | undefined>(undefined);
	#seq = 0;
	// The newest request whose answer is on screen, or the last one sent before a reset.
	#applied = 0;

	constructor(
		private readonly fetcher: () => Promise<T | null>,
		private readonly isEmpty: (data: T) => boolean = () => false
	) {}

	async load(): Promise<void> {
		const seq = ++this.#seq;
		let result: T | null;
		try {
			result = await this.fetcher();
		} catch (error) {
			console.warn('Analytics card failed to load:', error);
			result = null;
		}
		// Drop an answer older than the one on screen. A slow answer is still shown when a newer
		// request is on its way, or a query slower than the refresh interval would never land.
		if (seq <= this.#applied) return;
		if (result === null) {
			if (this.data === undefined) this.state = 'error';
			return;
		}
		this.#applied = seq;
		this.data = result;
		this.state = this.isEmpty(result) ? 'empty' : 'ready';
	}

	/** Back to `loading`, for a new subject or window: answers already on their way are dropped. */
	reset(): void {
		this.#applied = this.#seq;
		this.data = undefined;
		this.state = 'loading';
	}
}

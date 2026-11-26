import type { WidgetState } from '$lib/components/dashboard/kit';

/**
 * One card's data. `state` follows the dashboard kit: `loading` until the first answer, then
 * `ready`, `empty` (answered with nothing) or `error` (the request failed). A refresh that fails
 * keeps the last good answer on screen, the way the overview cards do.
 */
export class Loader<T> {
	state = $state<WidgetState>('loading');
	data = $state.raw<T | undefined>(undefined);
	#seq = 0;

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
		if (seq !== this.#seq) return;
		if (result === null) {
			if (this.data === undefined) this.state = 'error';
			return;
		}
		this.data = result;
		this.state = this.isEmpty(result) ? 'empty' : 'ready';
	}
}

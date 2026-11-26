export { default as CommitBars } from './commit-bars.svelte';
export { default as HistoryChart } from './history-chart.svelte';
export { Loader } from './loader.svelte';
export { default as Meter } from './meter.svelte';
export { default as Panel } from './panel.svelte';
export { default as RankingCard } from './ranking-card.svelte';
export { default as Segmented } from './segmented.svelte';
export { default as Sparkline } from './sparkline.svelte';
export { default as Status } from './status.svelte';
export { default as SummaryStrip } from './summary-strip.svelte';
export { default as Tile } from './tile.svelte';

/**
 * `loading`, `empty` and `error` keep the footprint of `ready`, so a widget never changes size.
 * `error` is a failed query, kept apart from `empty` (a query that answered with nothing).
 */
export type WidgetState = 'loading' | 'empty' | 'error' | 'ready';

export function widgetState(isLoaded: boolean, hasData: boolean, failed = false): WidgetState {
	if (!isLoaded) return 'loading';
	if (failed) return 'error';
	return hasData ? 'ready' : 'empty';
}

/** Numerals that line up in columns and keep 0 apart from O. */
export const NUM = 'tabular-nums slashed-zero';

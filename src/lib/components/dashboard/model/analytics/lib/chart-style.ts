import { MODEL_COLORS } from '../../overview/lib/models';

/**
 * Shared chart settings for Model Analytics, so every chart draws the same thing the same way.
 *
 * Percentiles are always lines, never stacked areas: p99 a 2px ink line, p95 a secondary solid
 * line, the mean a light dashed one.
 */
export type LineSpec = {
	color: string;
	width: number;
	style: 'line' | 'dashed' | 'dotted';
};

export const PERCENTILE: Record<'p99' | 'p95' | 'mean', LineSpec> = {
	p99: { color: 'var(--chart-3)', width: 2, style: 'line' },
	p95: { color: 'var(--chart-4)', width: 1.5, style: 'line' },
	mean: { color: 'var(--chart-5)', width: 1.5, style: 'dashed' }
};

/** Two measures of one thing (prompt vs generation, prefill vs decode): ink solid, ink dashed. */
export const PAIR: [LineSpec, LineSpec] = [
	{ color: 'var(--chart-3)', width: 1.5, style: 'line' },
	{ color: 'var(--chart-3)', width: 1.5, style: 'dashed' }
];

/** Running is ink; waiting is the warning colour. */
export const RUNNING: LineSpec = { color: 'var(--chart-3)', width: 1.5, style: 'line' };
export const WAITING: LineSpec = { color: 'var(--chart-1)', width: 1.5, style: 'line' };

/** A reference level drawn across a chart: a limit, a quota, the KV danger line. */
export const LIMIT: LineSpec = { color: 'var(--chart-4)', width: 1, style: 'dashed' };
export const DANGER: LineSpec = { color: 'var(--destructive)', width: 1, style: 'dashed' };

/** Categorical colours: chart-6 to chart-9. */
export const CATEGORY_COLORS = MODEL_COLORS;

/**
 * A colour per item (a pod, a cache tier) that follows the item, not its rank: items sorted by
 * name take chart-6 to chart-9 in turn. Past four, colours repeat.
 */
export function colorsFor(items: string[]): Map<string, string> {
	const sorted = [...new Set(items)].sort((a, b) => a.localeCompare(b));
	return new Map(sorted.map((item, i) => [item, CATEGORY_COLORS[i % CATEGORY_COLORS.length]]));
}

/** Finish reasons: Stop is neutral, Length limit a warning, Aborted severe. */
export const FINISH = {
	stop: 'var(--chart-4)',
	length: 'var(--chart-1)',
	aborted: 'var(--destructive)'
} as const;

/**
 * vLLM's `finished_reason` values folded into the three the chart shows: `repetition` is a normal
 * stop, `error` an aborted request.
 */
export function finishGroup(reason: string): keyof typeof FINISH {
	if (reason === 'length') return 'length';
	if (reason === 'abort' || reason === 'error') return 'aborted';
	return 'stop';
}

/** KV cache danger level for the per-pod chart. */
export const KV_DANGER = 90;

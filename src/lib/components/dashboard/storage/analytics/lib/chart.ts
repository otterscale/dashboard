import type { ChartSeries } from '$lib/components/dashboard/kit/history-chart.svelte';

// History lines (SPEC 5): the main line in ink at 2 px, a second one in chart-6, reference
// levels dashed. A warning level takes the warning colour, a stop level the critical one.
type Style = Pick<ChartSeries, 'style' | 'color' | 'width'>;
export const LINE: Record<'main' | 'second' | 'reference' | 'warning' | 'critical', Style> = {
	main: { style: 'line', color: 'var(--chart-3)', width: 2 },
	second: { style: 'line', color: 'var(--chart-6)', width: 1.5 },
	reference: { style: 'dashed', color: 'var(--chart-4)', width: 1 },
	warning: { style: 'dashed', color: 'var(--chart-1)', width: 1 },
	critical: { style: 'dashed', color: 'var(--destructive)', width: 1 }
};

/** History cards side by side from 56 rem; one per row below. */
export const HISTORY_GRID: Record<1 | 3, string> = {
	1: 'grid grid-cols-1 gap-2 @md:gap-3',
	3: 'grid grid-cols-1 gap-2 @md:gap-3 @4xl:grid-cols-3'
};

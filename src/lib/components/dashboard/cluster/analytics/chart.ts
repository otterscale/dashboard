/**
 * Look of the LayerChart charts of the Analytics tab, after the Solaris "Sales" chart: thin
 * lines, horizontal grid lines in the border colour, small muted tick labels, no tick marks
 * and no axis rules. Put on the element that wraps the chart.
 */
export const chartFrameClass = [
	'flex w-full justify-center overflow-visible text-xs',
	'[&_.lc-root-container]:w-full',
	// Grid: horizontal lines only, in the card's border colour.
	'[&_.lc-grid-y-rule]:stroke-border [&_.lc-grid-x-rule]:stroke-border',
	// No tick marks, no axis rules: the grid already draws the baseline.
	'[&_.lc-axis-tick]:stroke-0',
	'[&_.lc-rule-x-line:not(.lc-grid-x-rule)]:stroke-0 [&_.lc-rule-y-line:not(.lc-grid-y-rule)]:stroke-0',
	// Tick labels.
	'[&_.lc-axis-tick-label]:fill-muted-foreground [&_.lc-axis-tick-label]:font-normal',
	'[&_.lc-text]:text-[11px] [&_.lc-text-svg]:overflow-visible [&_text]:stroke-transparent',
	// Hover: a point on each series, no vertical line, and the other series keep their opacity.
	'[&_.lc-highlight-line]:stroke-border [&_.lc-highlight-point]:stroke-card',
	'[&_.lc-area-path]:opacity-100 [&_.lc-highlight-point]:opacity-100 [&_.lc-spline-path]:opacity-100',
	'[&_.lc-tooltip-rects-g]:fill-transparent [&_.lc-layout-svg-g]:fill-transparent'
].join(' ');

/** The tooltip's date line, the same in every chart of the tab. */
export function formatChartTooltipDate(date: Date): string {
	return date.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: 'numeric'
	});
}

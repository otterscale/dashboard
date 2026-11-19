/**
 * Status colours for the dashboards. These are the status tokens of app.css
 * (success, warning, destructive), never chart colours: a chart colour changes
 * with the theme's chart ramp, a warning must not.
 */
export type Level = 'ok' | 'warn' | 'danger' | 'neutral';

/** Level of a "lower is better" percentage: up to `warn` is fine, above `danger` is not. */
export function levelOf(percent: number, thresholds = { warn: 70, danger: 90 }): Level {
	if (!Number.isFinite(percent)) return 'neutral';
	if (percent > thresholds.danger) return 'danger';
	if (percent > thresholds.warn) return 'warn';
	return 'ok';
}

/**
 * Level of a count of bad things (failed pods, restarts, pending claims).
 * Zero is the normal case and gets no colour at all.
 */
export function levelOfCount(count: number, severity: 'warn' | 'danger' = 'warn'): Level {
	return count > 0 ? severity : 'neutral';
}

export const levelText: Record<Level, string> = {
	ok: 'text-success-foreground',
	warn: 'text-warning-foreground',
	danger: 'text-destructive',
	neutral: ''
};

/** Fill of a meter or bar. A neutral or healthy bar is the primary colour, not green. */
export const levelBar: Record<Level, string> = {
	ok: 'bg-primary',
	warn: 'bg-warning',
	danger: 'bg-destructive',
	neutral: 'bg-primary'
};

export const levelStatusVariant: Record<Level, 'success' | 'warning' | 'destructive' | 'default'> =
	{
		ok: 'success',
		warn: 'warning',
		danger: 'destructive',
		neutral: 'default'
	};

/** Card look shared by every dashboard widget: Solaris' flat, bordered surface. */
export const cardClass =
	'h-full rounded-xl border border-border bg-card shadow-none ring-0 [--card-spacing:--spacing(5)]';

/** A row or tile inside a card (Solaris' table rows and inner cards). */
export const insetClass = 'rounded-lg border border-border/60 bg-muted/40';

/**
 * Classes for the dense tables (node pressure, pod detail). The table scrolls
 * sideways inside its own box and never widens the page; the first column stays put.
 */
export const dataTable = {
	/** The scrolling box around the table. */
	scroller: 'w-full max-w-full overflow-x-auto rounded-lg border border-border/60',
	table: 'w-max min-w-full border-separate border-spacing-0 text-sm',
	groupHead:
		'h-8 border-b border-border/60 bg-muted/40 px-3 text-center text-xs font-medium text-muted-foreground',
	head: 'h-9 border-b border-border/60 bg-muted/40 px-3 text-right text-xs font-medium whitespace-nowrap text-muted-foreground',
	headFirst: 'text-left',
	cell: 'h-10 border-b border-border/40 px-3 text-right font-mono text-xs whitespace-nowrap tabular-nums',
	cellFirst: 'text-left font-sans text-sm font-medium',
	/** Add to the first column's th and td. Needs an opaque background. */
	sticky: 'sticky left-0 z-10 bg-card shadow-[1px_0_0_0_var(--border)]',
	/** A cell at or over 100 %: said with weight and a tint, not colour alone. */
	over: 'bg-destructive/10 font-semibold text-destructive',
	/** A value that is absent, drawn as a dash. */
	absent: 'text-muted-foreground/60'
} as const;

/** `muted` is a fact that is neither good nor bad, such as a design limit. */
export type Tone = 'ok' | 'warn' | 'bad' | 'muted';

/**
 * One status scale for every dashboard. `ok` and `warn` are the tokens `thresholdClasses()` in
 * `$lib/prometheus` gives healthy and warning, so a status and a threshold read the same.
 */
export const TONE_TEXT: Record<Tone, string> = {
	ok: 'text-chart-2',
	warn: 'text-chart-1',
	bad: 'text-destructive',
	muted: 'text-muted-foreground'
};
export const TONE_DOT: Record<Tone, string> = {
	ok: 'bg-chart-2',
	warn: 'bg-chart-1',
	bad: 'bg-destructive',
	muted: 'bg-muted-foreground'
};
export const TONE_PILL: Record<Tone, string> = {
	ok: 'bg-chart-2/12',
	warn: 'bg-chart-1/12',
	bad: 'bg-destructive/10',
	muted: 'bg-muted'
};

/** How a number reads at a glance. `muted` is for a count that is zero or not applicable. */
export type Tone = 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'muted';

export const toneText: Record<Tone, string> = {
	default: 'text-foreground',
	primary: 'text-primary',
	success: 'text-success',
	warning: 'text-warning',
	destructive: 'text-destructive',
	muted: 'text-muted-foreground'
};

export const toneFill: Record<Tone, string> = {
	default: 'bg-foreground',
	primary: 'bg-primary',
	success: 'bg-success',
	warning: 'bg-warning',
	destructive: 'bg-destructive',
	muted: 'bg-muted-foreground/40'
};

/** Tinted background with matching text, for an icon chip. */
export const toneChip: Record<Tone, string> = {
	default: 'bg-muted text-foreground',
	primary: 'bg-primary/10 text-primary',
	success: 'bg-success/10 text-success',
	warning: 'bg-warning/10 text-warning',
	destructive: 'bg-destructive/10 text-destructive',
	muted: 'bg-muted text-muted-foreground'
};

export const toneColor: Record<Tone, string> = {
	default: 'var(--foreground)',
	primary: 'var(--primary)',
	success: 'var(--success)',
	warning: 'var(--warning)',
	destructive: 'var(--destructive)',
	muted: 'var(--muted-foreground)'
};

/**
 * The tone of a usage ratio against a ceiling: fine, getting close, nearly out.
 * 75% and 90% are where a quota or a node starts to need attention.
 */
export function usageTone(ratio: number, warnAt = 0.75, criticalAt = 0.9): Tone {
	if (ratio >= criticalAt) return 'destructive';
	if (ratio >= warnAt) return 'warning';
	return 'primary';
}

/** A count of problems: nothing to see at zero, the given tone otherwise. */
export function problemTone(count: number, tone: Tone = 'destructive'): Tone {
	return count > 0 ? tone : 'muted';
}

/**
 * The tone of a saturation percentage (0 to 100, may exceed it when overcommitted), on the
 * thresholds the cluster dashboards already use: fine up to 70, close up to 90, critical beyond.
 */
export function pressureTone(percent: number | undefined): Tone {
	const value = Number(percent ?? 0);
	if (value <= 70) return 'success';
	if (value <= 90) return 'warning';
	return 'destructive';
}

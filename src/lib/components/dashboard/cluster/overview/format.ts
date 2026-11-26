import { m } from '$lib/messages';

/** A short, rounded-down duration: `12 s`, `3 min`, `5 h`, `2 d`. */
export function formatDuration(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	if (s < 60) return m.duration_seconds({ count: String(s) });
	const minutes = Math.floor(s / 60);
	if (minutes < 60) return m.duration_minutes({ count: String(minutes) });
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return m.duration_hours({ count: String(hours) });
	return m.duration_days({ count: String(Math.floor(hours / 24)) });
}

/**
 * Pressure colours on this page (SPEC 2): under 80 % healthy, 80–89 % warning, 90 % and up
 * critical, judged on the whole percent the reader sees.
 */
export const CAPACITY_THRESHOLDS = { green: 79.499, orange: 89.499 };

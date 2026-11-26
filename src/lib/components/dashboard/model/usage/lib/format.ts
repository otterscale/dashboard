import { DASH } from '$lib/components/dashboard/kit/format';

export { DASH };

const grouped = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/**
 * Whole numbers with grouping, e.g. requests: `4,812`. Overview's `fmtCount` has no grouping: its
 * counts are replicas and queued requests.
 */
export function fmtGrouped(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	return grouped.format(Math.round(value));
}

/** Token counts in three significant digits: `53`, `60.0 K`, `920 K`, `6.32 M`. */
export function fmtTokens(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	const v = Math.round(value);
	if (Math.abs(v) < 1000) return String(v);
	const units = ['K', 'M', 'B', 'T'];
	let n = v / 1000;
	let i = 0;
	while (Math.abs(n) >= 999.5 && i < units.length - 1) {
		n /= 1000;
		i++;
	}
	const digits = Math.abs(n) >= 99.95 ? 0 : Math.abs(n) >= 9.995 ? 1 : 2;
	return `${n.toFixed(digits)} ${units[i]}`;
}

/** A token count that is legitimately absent shows a dash rather than a zero. */
export function fmtTokensOrDash(value: number): string {
	return value > 0 ? fmtTokens(value) : DASH;
}

export function fmtShare(part: number, whole: number): string {
	if (!(whole > 0)) return DASH;
	return `${Math.round((part / whole) * 100)}%`;
}

/** A part of a whole as a percent, one decimal under 10 %; Overview's `fmtPercent` takes a percent. */
export function fmtPercentOf(part: number, whole: number): string {
	if (!(whole > 0)) return '0%';
	const p = (part / whole) * 100;
	return `${p > 0 && p < 10 ? p.toFixed(1) : Math.round(p)}%`;
}

/** `Nov 20`, in the reader's locale. */
export function fmtDay(iso: string | undefined, locale: string): string {
	if (!iso) return DASH;
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return DASH;
	return d.toLocaleDateString(locale, { month: 'short', day: 'numeric' });
}

/**
 * A round top for a y axis of whole counts, whose half is round too: 6 → 6, 201 → 240, 0 → 0.
 * Overview's `niceTop` is for rates: it never answers 0 and steps by tenths under 1.
 */
export function niceCountTop(max: number): number {
	if (!(max > 0)) return 0;
	if (max <= 10) return Math.max(2, Math.ceil(max / 2) * 2);
	const p = 10 ** Math.floor(Math.log10(max));
	for (const f of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (f * p >= max - 1e-9) return f * p;
	return 10 * p;
}

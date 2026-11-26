import { formatDuration } from '$lib/components/dashboard/kit/format';
import { TONE_DOT, TONE_TEXT } from '$lib/components/dashboard/kit/tone';
import { m } from '$lib/messages';

import { FULL_IN_CAP_DAYS, type Growth, type Level, type Service } from './ceph';

export const DASH = '—';

const number = (value: number, digits: number) =>
	new Intl.NumberFormat('en-US', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	}).format(value);

/** Bytes in binary units, the way `ceph df` shows them: three significant digits. */
export function fmtBytes(bytes: number | undefined): string {
	if (bytes === undefined || !Number.isFinite(bytes)) return DASH;
	const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'];
	let value = Math.abs(bytes);
	let i = 0;
	while (value >= 1024 && i < units.length - 1) {
		value /= 1024;
		i++;
	}
	const digits = i === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
	return `${bytes < 0 ? '−' : ''}${number(value, digits)} ${units[i]}`;
}

/** Bytes a second in decimal units, as throughput is quoted. */
export function fmtRate(bytesPerSecond: number | undefined): string {
	if (bytesPerSecond === undefined || !Number.isFinite(bytesPerSecond)) return DASH;
	const units = ['B/s', 'kB/s', 'MB/s', 'GB/s'];
	let value = Math.max(0, bytesPerSecond);
	let i = 0;
	while (value >= 1000 && i < units.length - 1) {
		value /= 1000;
		i++;
	}
	return `${number(value, i === 0 || value === 0 || value >= 100 ? 0 : 1)} ${units[i]}`;
}

export function fmtIops(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	return `${number(value, value === 0 || value >= 10 ? 0 : 1)} IOPS`;
}

export function fmtMs(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	return `${number(value, value === 0 || value >= 10 ? 0 : 1)} ms`;
}

/** A round number at or above `max` whose half is round too: 1, 2, 2.5, 5 or 10 times a power of ten, doubled. */
export function niceTop(max: number): number {
	if (!(max > 0)) return 1;
	const half = max / 2;
	const magnitude = 10 ** Math.floor(Math.log10(half));
	const step = [1, 2, 2.5, 5, 10].find((n) => n * magnitude >= half) ?? 10;
	return 2 * step * magnitude;
}

/** "+18.0 GiB/day", "Flat", or a dash when there is no estimate. */
export function fmtGrowth(growth: Growth | undefined): string {
	if (!growth) return DASH;
	if (growth.kind === 'flat') return m.storage_growth_flat();
	const sign = growth.kind === 'growing' ? '+' : '';
	return m.storage_per_day({ value: `${sign}${fmtBytes(growth.perDay)}` });
}

/** A percentage with as many decimals as it takes to not read 0 for a sliver. */
export function fmtPct(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	const digits = value === 0 || value >= 10 ? 0 : value >= 1 ? 1 : 2;
	return `${number(value, digits)}%`;
}

export function fmtCount(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	return number(value, 0);
}

export function fmtCopies(copies: number | undefined, label: string | undefined): string {
	if (copies === undefined) return '';
	if (label?.startsWith('EC')) return m.storage_copies_ec();
	return copies === 1 ? m.storage_copies_one() : m.storage_copies({ count: String(copies) });
}

export function osdsLabel(count: number): string {
	return count === 1 ? m.storage_osds_one() : m.storage_osds({ count: String(count) });
}

/** Days ahead, as days up to a year and years after: "218 days", "6.1 years". */
export function fmtDaysAhead(days: number): string {
	if (days < 1.5) return m.storage_days_one();
	if (days <= 365) return m.storage_days({ count: String(Math.round(days)) });
	return m.storage_years({ count: number(days / 365, 1) });
}

/** The Full in column: about N days, "> 5 years" past the cap, a dash when not growing. */
export function fmtFullIn(days: number | undefined): string {
	if (days === undefined) return DASH;
	if (days > FULL_IN_CAP_DAYS) return m.storage_full_in_over();
	return m.storage_full_in_about({ duration: fmtDaysAhead(days) });
}

/** How long a check has run: `3 h`, `14 min`, `7 d+`. */
export function fmtAge(seconds: number, atLeast: boolean): string {
	const text = formatDuration(seconds);
	return atLeast ? m.storage_age_at_least({ duration: text }) : text;
}

/** Time left, rounded up to something a person reads: `6 min`, `2 h`. */
export function fmtLeft(seconds: number): string {
	return formatDuration(Math.max(60, seconds));
}

// Ceph's levels in the dashboards' one status scale, so the classes are named once, in the kit.
export const LEVEL_TEXT: Record<Level, string> = {
	green: TONE_TEXT.ok,
	orange: TONE_TEXT.warn,
	red: TONE_TEXT.bad
};

export const LEVEL_BG: Record<Level, string> = {
	green: TONE_DOT.ok,
	orange: TONE_DOT.warn,
	red: TONE_DOT.bad
};

export function serviceLabel(service: Service): string {
	switch (service) {
		case 'rbd':
			return m.storage_service_rbd();
		case 'cephfs-data':
			return m.storage_service_cephfs_data();
		case 'cephfs-metadata':
			return m.storage_service_cephfs_metadata();
		case 'object':
			return m.storage_service_object();
		case 'system':
			return m.storage_service_system();
		default:
			return m.storage_service_other();
	}
}

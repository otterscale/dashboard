import { classifyThreshold, thresholdClasses } from '$lib/prometheus';

import { CAPACITY_THRESHOLDS } from '../../overview/format';

export const GIB = 1024 ** 3;
export const MIB = 1024 ** 2;

/** An em dash: the value for "nothing to show here". */
export const DASH = '—';

const grouped = (digits: number) =>
	new Intl.NumberFormat('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export function fmt(value: number | undefined, digits = 0): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	return grouped(digits).format(value);
}

/** Cores: two decimals under one core, one above. */
export function fmtCores(value: number | undefined): string {
	if (value === undefined) return DASH;
	return fmt(value, Math.abs(value) < 1 ? 2 : 1);
}

/** Memory in GiB from bytes: one decimal under 10 GiB, whole numbers above. */
export function fmtGiB(bytes: number | undefined): string {
	if (bytes === undefined) return DASH;
	const v = bytes / GIB;
	return fmt(v, Math.abs(v) < 10 ? 1 : 0);
}

/** GPU frame buffer in GiB from bytes, always two decimals so cards line up. */
export function fmtGpuGiB(bytes: number | undefined): string {
	if (bytes === undefined) return DASH;
	return fmt(bytes / GIB, 2);
}

export function fmtPct(value: number | undefined, digits = 0): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	return `${fmt(value, digits)}%`;
}

/** Bytes per second in decimal units, the way link speeds are quoted. */
export function fmtRate(bytesPerSecond: number | undefined): string {
	if (bytesPerSecond === undefined || !Number.isFinite(bytesPerSecond)) return DASH;
	const units = ['B/s', 'kB/s', 'MB/s', 'GB/s', 'TB/s'];
	let v = Math.max(0, bytesPerSecond);
	let i = 0;
	while (v >= 1000 && i < units.length - 1) {
		v /= 1000;
		i++;
	}
	return `${fmt(v, v < 10 && i > 0 ? 2 : 0)} ${units[i]}`;
}

/** Split a rate into its number and unit, for a large number with a small unit beside it. */
export function splitRate(bytesPerSecond: number | undefined): { value: string; unit: string } {
	const [value, unit] = fmtRate(bytesPerSecond).split(' ');
	return { value, unit: unit ?? '' };
}

/**
 * SPEC 2: Request and Allocated read healthy under 80 %, warning at 80–89 %, critical from 90 %.
 * Usage and Limit are never coloured.
 */
export function pressureText(percent: number | undefined): string {
	if (percent === undefined || !Number.isFinite(percent)) return '';
	return thresholdClasses(classifyThreshold(percent, CAPACITY_THRESHOLDS)).text;
}

/** Same scale, as a background for bars. */
export function pressureBg(percent: number | undefined): string {
	if (percent === undefined || !Number.isFinite(percent)) return 'bg-chart-3';
	const level = classifyThreshold(percent, CAPACITY_THRESHOLDS);
	return level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2';
}

export function sum(values: Iterable<number>): number {
	let total = 0;
	for (const v of values) if (Number.isFinite(v)) total += v;
	return total;
}

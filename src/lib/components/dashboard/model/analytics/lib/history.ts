import type { Series } from '$lib/components/dashboard/kit/fetch';
import type { ChartPoint, ChartSeries } from '$lib/components/dashboard/kit/history-chart.svelte';

import { colorsFor, finishGroup, type LineSpec } from './chart-style';
import { shortPod } from './pods';

/** A chart series drawn with one of the shared line specs. */
export function line(key: string, label: string, spec: LineSpec, hideLegend = false): ChartSeries {
	return { key, label, color: spec.color, width: spec.width, style: spec.style, hideLegend };
}

/** Merge named single-series results into rows by time. */
export function mergeNamed(result: Record<string, Series[]>, keys: string[]): ChartPoint[] {
	const rows = new Map<number, ChartPoint>();
	for (const key of keys) {
		for (const p of result[key]?.[0]?.points ?? []) {
			const row = rows.get(p.t) ?? ({ date: new Date(p.t) } as ChartPoint);
			row[key] = p.v;
			rows.set(p.t, row);
		}
	}
	return [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/**
 * One line per pod, coloured by name (chart-6 to chart-9) and labelled with the end of its name.
 * Keys are `s0`, `s1`, … so a pod name never has to be a property path.
 */
export function perPod(series: Series[]): { data: ChartPoint[]; series: ChartSeries[] } {
	const pods = series.map((s) => s.labels.pod).filter(Boolean);
	const colors = colorsFor(pods);
	const sorted = [...series]
		.filter((s) => s.labels.pod)
		.sort((a, b) => a.labels.pod.localeCompare(b.labels.pod));
	const rows = new Map<number, ChartPoint>();
	const out: ChartSeries[] = [];
	sorted.forEach((s, i) => {
		const key = `s${i}`;
		out.push({
			key,
			label: shortPod(s.labels.pod),
			color: colors.get(s.labels.pod),
			width: 1.5,
			style: 'line'
		});
		for (const p of s.points) {
			const row = rows.get(p.t) ?? ({ date: new Date(p.t) } as ChartPoint);
			row[key] = p.v;
			rows.set(p.t, row);
		}
	});
	return {
		data: [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime()),
		series: out
	};
}

/** Add a constant reference level to every row. */
export function withLevel(
	data: ChartPoint[],
	key: string,
	value: number | undefined
): ChartPoint[] {
	if (value === undefined || !Number.isFinite(value)) return data;
	return data.map((d) => ({ ...d, [key]: value }));
}

export type FinishPoint = { date: Date; end: Date; stop: number; length: number; aborted: number };

/** Finished requests per bucket, folded into Stop, Length limit and Aborted. */
export function finishBuckets(series: Series[], bucketSeconds: number): FinishPoint[] {
	const rows = new Map<number, FinishPoint>();
	for (const s of series) {
		const group = finishGroup(s.labels.finished_reason ?? '');
		for (const p of s.points) {
			// A sample at t counts the bucket that ends at t.
			const start = p.t - bucketSeconds * 1000;
			const row = rows.get(start) ?? {
				date: new Date(start),
				end: new Date(p.t),
				stop: 0,
				length: 0,
				aborted: 0
			};
			row[group] += Math.max(0, p.v);
			rows.set(start, row);
		}
	}
	return [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Token-length bins for the heat maps: `0–20`, `20–50`, …, `> 20K`. */
export type LengthBin = { label: string; le: string[] };

function fmtLe(n: number): string {
	if (n >= 1000) return `${n / 1000}K`;
	return String(n);
}

/**
 * Turn cumulative `le` series into requests per bin per time: the bins at and below 20 tokens are
 * one bin, then one per bucket boundary, then everything above the last.
 */
export function lengthGrid(
	series: Series[],
	minLe = 20
): { bins: string[]; times: number[]; counts: number[][] } {
	const bounds = series
		.map((s) => s.labels.le)
		.filter((le): le is string => !!le && le !== '+Inf')
		.map(Number)
		.filter((n) => Number.isFinite(n) && n >= minLe)
		.sort((a, b) => a - b);
	const uniq = [...new Set(bounds)];
	const byLe = new Map<string, Map<number, number>>();
	const times = new Set<number>();
	for (const s of series) {
		const key = s.labels.le === '+Inf' ? 'inf' : String(Number(s.labels.le));
		const m = new Map<number, number>();
		for (const p of s.points) {
			m.set(p.t, p.v);
			times.add(p.t);
		}
		byLe.set(key, m);
	}
	const sortedTimes = [...times].sort((a, b) => a - b);
	const cum = (le: number | 'inf', t: number) =>
		Math.max(0, byLe.get(le === 'inf' ? 'inf' : String(le))?.get(t) ?? 0);
	const bins: string[] = [];
	const counts: number[][] = [];
	uniq.forEach((le, i) => {
		const prev = i === 0 ? 0 : uniq[i - 1];
		bins.push(`${fmtLe(prev)}–${fmtLe(le)}`);
		counts.push(sortedTimes.map((t) => Math.max(0, cum(le, t) - (i === 0 ? 0 : cum(prev, t)))));
	});
	if (uniq.length > 0) {
		const last = uniq[uniq.length - 1];
		bins.push(`> ${fmtLe(last)}`);
		counts.push(sortedTimes.map((t) => Math.max(0, cum('inf', t) - cum(last, t))));
	}
	return { bins, times: sortedTimes, counts };
}

/** A bucket length that gives about `points` buckets, in whole multiples of `unit` seconds. */
export function bucketFor(start: Date, end: Date, points: number, unit: number): number {
	const seconds = (end.getTime() - start.getTime()) / 1000;
	return Math.max(unit, Math.round(seconds / points / unit) * unit);
}

/** A count that may be an average: a whole number as it is, anything else to one decimal. */
export function fmtDecimal(v: number): string {
	return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** A window over a day and a half reads by date, a shorter one by time. */
export function isLongSpan(ms: number): boolean {
	return ms > 36 * 3600_000;
}

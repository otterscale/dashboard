import { displayName } from './models';

/** One model's range result: its key and its finite points. */
export type ModelRange = { key: string; points: { time: number; value: number }[] };

export type TrendLine = { key: string; label: string; color: string };
export type TrendRow = { date: Date } & Record<string, number | Date | null>;

/** Every model that has a series in any of the results, once. */
export function rangeKeys(...results: (ModelRange[] | undefined)[]): string[] {
	return [...new Set(results.flatMap((r) => (r ?? []).map((x) => x.key)))];
}

/** Add up a model's series (several model names under one service) point by point. */
export function sparkValues(ranges: ModelRange[]): Map<string, number[]> {
	const out = new Map<string, number[]>();
	for (const r of ranges) {
		const values = r.points.map((p) => p.value);
		const prev = out.get(r.key);
		out.set(r.key, prev ? prev.map((v, i) => v + (values[i] ?? 0)) : values);
	}
	return out;
}

/**
 * One line per coloured model, in the order of the colour map; models without a colour are not
 * drawn. A model's several series (model names under one service) add up or take the worst.
 * Chart keys are plain (`s0`…) because model keys hold a slash, which a CSS variable name cannot.
 */
export function trendLines(
	ranges: ModelRange[],
	colors: Map<string, string>,
	combine: 'sum' | 'max'
): { series: TrendLine[]; points: TrendRow[] } {
	const byLine = new Map<string, Map<number, number>>();
	for (const r of ranges) {
		if (!colors.has(r.key)) continue;
		const at = byLine.get(r.key) ?? new Map<number, number>();
		for (const p of r.points) {
			const prev = at.get(p.time);
			at.set(
				p.time,
				prev === undefined ? p.value : combine === 'sum' ? prev + p.value : Math.max(prev, p.value)
			);
		}
		byLine.set(r.key, at);
	}
	const order = [...colors.keys()].filter((k) => byLine.has(k));
	const series = order.map((key, i) => ({
		key: `s${i}`,
		label: displayName(key),
		color: colors.get(key)!
	}));
	const times = [...new Set(order.flatMap((key) => [...byLine.get(key)!.keys()]))].sort(
		(a, b) => a - b
	);
	const points = times.map((t) => {
		const point: TrendRow = { date: new Date(t) };
		order.forEach((key, i) => (point[`s${i}`] = byLine.get(key)!.get(t) ?? null));
		return point;
	});
	return { series, points };
}

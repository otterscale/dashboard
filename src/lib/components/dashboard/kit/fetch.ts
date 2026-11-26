import type { InstantVector, PrometheusDriver, RangeVector } from 'prometheus-query';

/** One instant sample with its labels. */
export type Sample = { labels: Record<string, string>; value: number };
/** One range series with its labels; `t` is a Unix time in milliseconds. */
export type Series = { labels: Record<string, string>; points: { t: number; v: number }[] };

const TAG = '__series__';

// Each named query is tagged with its name and joined with `or`, so a card asks Prometheus once
// however many numbers it shows. The tag keeps two sub-queries with the same label set apart.
function combine(queries: Record<string, string>): string {
	return Object.entries(queries)
		.map(([name, q]) => `label_replace((${q}), "${TAG}", "${name}", "", "")`)
		.join(' or ');
}

function untag(labels: Record<string, string>): [string | undefined, Record<string, string>] {
	const { [TAG]: name, ...rest } = labels;
	return [name, rest];
}

/**
 * Run named instant queries in one request. Resolves `null` when the request failed, so a card
 * can tell "couldn't load" from "answered with nothing".
 */
export async function fetchInstant<K extends string>(
	client: PrometheusDriver,
	queries: Record<K, string>,
	time?: Date
): Promise<Record<K, Sample[]> | null> {
	const out = Object.fromEntries(Object.keys(queries).map((k) => [k, [] as Sample[]])) as Record<
		K,
		Sample[]
	>;
	try {
		const response = await client.instantQuery(combine(queries), time);
		for (const vector of response.result as InstantVector[]) {
			const [name, labels] = untag(vector.metric.labels as Record<string, string>);
			if (!name || !(name in out)) continue;
			const value = Number(vector.value?.value);
			if (Number.isFinite(value)) out[name as K].push({ labels, value });
		}
		return out;
	} catch (error) {
		console.warn('Analytics instant query failed:', error);
		return null;
	}
}

/** Run named range queries in one request, keeping every series' labels. */
export async function fetchRange<K extends string>(
	client: PrometheusDriver,
	queries: Record<K, string>,
	start: Date,
	end: Date,
	stepSeconds: number
): Promise<Record<K, Series[]> | null> {
	const out = Object.fromEntries(Object.keys(queries).map((k) => [k, [] as Series[]])) as Record<
		K,
		Series[]
	>;
	try {
		const response = await client.rangeQuery(combine(queries), start, end, `${stepSeconds}s`);
		for (const vector of response.result as RangeVector[]) {
			const [name, labels] = untag(vector.metric.labels as Record<string, string>);
			if (!name || !(name in out)) continue;
			const points = vector.values
				.map((s) => ({ t: new Date(s.time).getTime(), v: Number(s.value) }))
				.filter((p) => Number.isFinite(p.v));
			out[name as K].push({ labels, points });
		}
		return out;
	} catch (error) {
		console.warn('Analytics range query failed:', error);
		return null;
	}
}

/** The first sample's value, or undefined when the query answered with nothing. */
export function scalar(samples: Sample[] | undefined): number | undefined {
	return samples && samples.length > 0 ? samples[0].value : undefined;
}

/** Index samples by one label. */
export function byLabel(samples: Sample[] | undefined, label: string): Map<string, number> {
	const map = new Map<string, number>();
	for (const s of samples ?? []) {
		const key = s.labels[label];
		if (key !== undefined) map.set(key, s.value);
	}
	return map;
}

/** Index samples by `namespace/pod`. */
export function byPod(samples: Sample[] | undefined): Map<string, number> {
	const map = new Map<string, number>();
	for (const s of samples ?? []) {
		const { namespace, pod } = s.labels;
		if (namespace && pod) map.set(`${namespace}/${pod}`, s.value);
	}
	return map;
}

/** Step for a window: about `points` samples, never under 15 s, always whole seconds. */
export function stepFor(start: Date, end: Date, points = 60): number {
	return Math.max(15, Math.round((end.getTime() - start.getTime()) / 1000 / points));
}

/** PromQL range literal for a window, in whole seconds. */
export function rangeLiteral(start: Date, end: Date): string {
	return `${Math.max(60, Math.round((end.getTime() - start.getTime()) / 1000))}s`;
}

/** Merge the first series of each named query into rows keyed by time, for one chart. */
export function toPoints<K extends string>(
	result: Record<K, Series[]>,
	keys: K[]
): ({ date: Date } & Record<string, number | Date>)[] {
	const rows = new Map<number, { date: Date } & Record<string, number | Date>>();
	for (const key of keys) {
		for (const p of result[key]?.[0]?.points ?? []) {
			const row = rows.get(p.t) ?? { date: new Date(p.t) };
			row[key] = p.v;
			rows.set(p.t, row);
		}
	}
	return [...rows.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Average and peak of a series' values; undefined when it has none. */
export function stats(series: Series | undefined): { avg?: number; peak?: number; last?: number } {
	const values = (series?.points ?? []).map((p) => p.v);
	if (values.length === 0) return {};
	return {
		avg: values.reduce((a, b) => a + b, 0) / values.length,
		peak: Math.max(...values),
		last: values[values.length - 1]
	};
}

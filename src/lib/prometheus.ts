import { type PrometheusDriver, RangeVector } from 'prometheus-query';

import type { ChartConfig } from '$lib/components/ui/chart/index.js';

/** Escape a value for use inside PromQL double-quoted string literals (e.g. `namespace="..."`). */
export function escapePromqlStringLiteral(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Label selector for vLLM dashboard metrics: namespace, or namespace + `llm_inference_service` for one ModelService.
 * `selectedModel === '.*'` means all ModelServices in the namespace (namespace filter only).
 */
function vllmMetricsLabelSelector(
	namespace: string | undefined,
	selectedModel: string | undefined
): string {
	const ns = (namespace ?? '').trim();
	const sm = selectedModel ?? '.*';
	if (!ns) {
		if (sm === '.*') return '';
		const msEsc = escapePromqlStringLiteral(sm);
		return `llm_inference_service="${msEsc}"`;
	}
	const nsEsc = escapePromqlStringLiteral(ns);
	if (sm === '.*') {
		return `namespace="${nsEsc}"`;
	}
	const msEsc = escapePromqlStringLiteral(sm);
	return `namespace="${nsEsc}",llm_inference_service="${msEsc}"`;
}

/** Wrap a vLLM metric name with `{ ... }` selector (empty selector → `{}`). */
export function vllmMetricWithSelector(
	metric: string,
	namespace: string | undefined,
	selectedModel: string | undefined
): string {
	const sel = vllmMetricsLabelSelector(namespace, selectedModel);
	return sel ? `${metric}{${sel}}` : `${metric}{}`;
}

/**
 * Compute a query step (in seconds) that keeps the total data-point count
 * safely below the Prometheus 11 000-point-per-series limit.
 *
 * For short ranges the returned step equals {@link minStep} so chart
 * resolution stays unchanged; for longer ranges it scales up automatically.
 *
 * @param startMs  Range start in epoch milliseconds.
 * @param endMs    Range end   in epoch milliseconds.
 * @param minStep    Minimum step in seconds (default 120 = 2 min).
 * @param maxPoints  Target upper bound on samples per series (default 10 000).
 */
export function computeStep(
	startMs: number,
	endMs: number,
	minStep = 120,
	maxPoints = 10_000
): number {
	const rangeSeconds = (endMs - startMs) / 1000;
	return Math.max(minStep, Math.ceil(rangeSeconds / maxPoints));
}

/** Convert (start, end) into a PromQL range literal like "1h" / "30m". */
export function rangeLiteralFromWindow(startMs: number, endMs: number): string {
	const secs = Math.max(60, Math.floor((endMs - startMs) / 1000));
	if (secs % 3600 === 0) return `${secs / 3600}h`;
	if (secs % 60 === 0) return `${secs / 60}m`;
	return `${secs}s`;
}

/**
 * Window-vs-window trend ratio, e.g. 0.05 = +5%.
 * Computes `(avg(window) - avg(prev window)) / avg(prev window)` server-side
 * via a single instant query, so it's stable against single-sample jitter.
 */
export async function fetchTrendPct(
	client: PrometheusDriver,
	inner: string,
	range: string
): Promise<number> {
	const query =
		`(avg_over_time((${inner})[${range}:]) - avg_over_time((${inner})[${range}:] offset ${range}))` +
		` / avg_over_time((${inner})[${range}:] offset ${range})`;
	try {
		const response = await client.instantQuery(query);
		const raw = response.result[0]?.value?.value;
		const num = Number(raw);
		return Number.isFinite(num) ? num : 0;
	} catch {
		return 0;
	}
}

export type ThresholdLevel = 'green' | 'orange' | 'red';

/**
 * Classify a value into a 3-step health level.
 * - `lower-is-better`: ≤green → green, ≤orange → orange, else red.
 * - `higher-is-better`: ≥green → green, ≥orange → orange, else red.
 */
export function classifyThreshold(
	value: number,
	thresholds: { green: number; orange: number },
	direction: 'lower-is-better' | 'higher-is-better' = 'lower-is-better'
): ThresholdLevel {
	if (direction === 'lower-is-better') {
		if (value <= thresholds.green) return 'green';
		if (value <= thresholds.orange) return 'orange';
		return 'red';
	}
	if (value >= thresholds.green) return 'green';
	if (value >= thresholds.orange) return 'orange';
	return 'red';
}

/** Tailwind class fragments per threshold level. Compose at the call site. */
export function thresholdClasses(level: ThresholdLevel): {
	text: string;
	border: string;
	bg: string;
} {
	switch (level) {
		case 'green':
			return { text: 'text-chart-2', border: '', bg: '' };
		case 'orange':
			return { text: 'text-chart-1', border: 'border-chart-1', bg: '' };
		case 'red':
			return { text: 'text-destructive', border: 'border-destructive', bg: 'bg-destructive/5' };
	}
}

export type DataPoint = Record<string, Date | number>;

const CHART_COLORS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];

function getLabelKey(vec: RangeVector): string {
	const labels = vec.metric.labels as Record<string, string>;
	const values = Object.values(labels);
	if (values.length === 0) return 'value';
	if (values.length === 1) return values[0];
	return Object.entries(labels)
		.map(([k, v]) => `${k}="${v}"`)
		.join(',');
}

/**
 * Run a single range query that may return multiple labelled series (e.g. `sum by (cpu) ...`).
 * Returns a flat array of DataPoints keyed by label value, sorted by time.
 */
export async function fetchFlattenedRange(
	client: PrometheusDriver,
	query: string,
	start: Date,
	end: Date,
	step: number
): Promise<DataPoint[]> {
	const response = await client.rangeQuery(query, start, end, `${step}s`);
	const vectors = response.result as RangeVector[];
	const dateMap = new Map<number, DataPoint>();
	for (const vector of vectors) {
		const key = getLabelKey(vector);
		for (const sample of vector.values) {
			const time = (sample.time as Date).getTime();
			if (!dateMap.has(time)) dateMap.set(time, { date: sample.time as Date });
			dateMap.get(time)![key] = Number(sample.value);
		}
	}
	return Array.from(dateMap.values()).sort(
		(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
	);
}

/**
 * Run multiple named range queries in parallel.
 * Each key in `queries` becomes a series name in the resulting DataPoints.
 */
export async function fetchMultipleFlattenedRange(
	client: PrometheusDriver,
	queries: Record<string, string>,
	start: Date,
	end: Date,
	step: number
): Promise<DataPoint[]> {
	const results = await Promise.all(
		Object.entries(queries).map(async ([name, q]) => {
			const r = await client.rangeQuery(q, start, end, `${step}s`);
			return { name, vectors: r.result as RangeVector[] };
		})
	);
	const dateMap = new Map<number, DataPoint>();
	for (const { name, vectors } of results) {
		for (const vector of vectors) {
			for (const sample of vector.values) {
				const time = (sample.time as Date).getTime();
				if (!dateMap.has(time)) dateMap.set(time, { date: sample.time as Date });
				dateMap.get(time)![name] = Number(sample.value);
			}
		}
	}
	return Array.from(dateMap.values()).sort(
		(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
	);
}

/** Build layerchart-compatible ChartConfig from DataPoint array. */
export function generateChartConfig(data: DataPoint[]): ChartConfig {
	if (!data.length) return {};
	const keys = Object.keys(data[0]).filter((k) => k !== 'date');
	return Object.fromEntries(
		keys.map((key, i) => [
			key,
			{ label: key, color: `var(--${CHART_COLORS[i % CHART_COLORS.length]})` }
		])
	) as ChartConfig;
}

/** Convert ChartConfig to the `series` array expected by layerchart AreaChart. */
export function getSeries(config: ChartConfig): { key: string; color: string }[] {
	return Object.entries(config).map(([key, value]) => ({
		key,
		color: (value as { color: string }).color
	}));
}

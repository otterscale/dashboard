import { InstantVector, type PrometheusDriver, RangeVector } from 'prometheus-query';

import type { ChartConfig } from '$lib/components/ui/chart/index.js';
import { m } from '$lib/paraglide/messages';

/** Escape a value for use inside PromQL double-quoted string literals (e.g. `namespace="..."`). */
export function escapePromqlStringLiteral(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Identity prefix for standalone models — vLLM deployed directly, without the managed
 * serving stack. Such pods carry no `llm_inference_service` label, so they are keyed by
 * `model_name` instead. `:` can't appear in a managed model's `llm_inference_service`
 * value (a DNS-1123 name), so this prefix can never collide with a managed model's id.
 */
const STANDALONE_ID_PREFIX = 'standalone:';

/** Build the selected-model token for a standalone model (matched later by `model_name`). */
export function encodeStandaloneModelId(modelName: string): string {
	return `${STANDALONE_ID_PREFIX}${modelName}`;
}

export type VllmModelIdentity = {
	/** Stable token to pass as `selectedModel` (drives the detail-panel selector). */
	id: string;
	/** Human-friendly display name. */
	label: string;
	/** Tag shown next to the label; set only for standalone models. */
	badge?: string;
};

/**
 * Derive a model's identity from a metric's labels. Managed models are keyed by
 * `llm_inference_service`; standalone models (deployed without it) fall back to
 * their `model_name`, encoded so the detail panels can still scope their queries.
 */
export function vllmModelIdentityFromLabels(labels: Record<string, string>): VllmModelIdentity {
	const service = labels.llm_inference_service;
	if (service) return { id: service, label: service };
	const modelName = labels.model_name ?? '';
	return {
		id: encodeStandaloneModelId(modelName),
		label: modelName || '(unknown)',
		badge: m.standalone()
	};
}

/**
 * Collapse rows that share an `id` into one, ordered by descending merged value.
 *
 * The top-N queries group `by(llm_inference_service, model_name)`, so a single model `id` can
 * appear in several rows — one managed service serving multiple `model_name`s (e.g. LoRA adapters),
 * or two standalone models that share a `model_name` across namespaces. Rendering those as-is would
 * crash the keyed `{#each}` (duplicate keys) and mis-state the metric, so callers merge them here
 * with the reducer matching their query's aggregation: `(a, b) => a + b` for additive rates
 * (throughput), `Math.max` for gauges/quantiles (KV pressure, p99 latency).
 */
export function mergeVllmRowsById<T extends VllmModelIdentity & { value: number }>(
	rows: T[],
	combine: (a: number, b: number) => number
): T[] {
	const byId = new Map<string, T>();
	for (const row of rows) {
		const prev = byId.get(row.id);
		if (prev) prev.value = combine(prev.value, row.value);
		else byId.set(row.id, { ...row });
	}
	return [...byId.values()].sort((a, b) => b.value - a.value);
}

/**
 * Label selector for vLLM dashboard metrics: namespace, or namespace + model identity.
 * `selectedModel === '.*'` means all models in the namespace (namespace filter only).
 * A managed model is matched by `llm_inference_service`; a standalone model (token built
 * via {@link encodeStandaloneModelId}) is matched by an empty `llm_inference_service`
 * plus its `model_name`, since those pods never carry that label.
 */
function vllmMetricsLabelSelector(
	namespace: string | undefined,
	selectedModel: string | undefined
): string {
	const ns = (namespace ?? '').trim();
	const sm = selectedModel ?? '.*';
	const parts: string[] = [];
	if (ns) parts.push(`namespace="${escapePromqlStringLiteral(ns)}"`);
	if (sm !== '.*') {
		if (sm.startsWith(STANDALONE_ID_PREFIX)) {
			const mnEsc = escapePromqlStringLiteral(sm.slice(STANDALONE_ID_PREFIX.length));
			parts.push(`llm_inference_service=""`, `model_name="${mnEsc}"`);
		} else {
			parts.push(`llm_inference_service="${escapePromqlStringLiteral(sm)}"`);
		}
	}
	return parts.join(',');
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

/**
 * Chart CSS variable matching {@link thresholdClasses}' text color, so a KPI card's
 * sparkline can be tinted by the same health level as its big number.
 * Mirrors the text mapping: green → chart-2, orange → chart-1, red → destructive.
 */
export function thresholdChartColor(level: ThresholdLevel): string {
	switch (level) {
		case 'green':
			return 'var(--chart-2)';
		case 'orange':
			return 'var(--chart-1)';
		case 'red':
			return 'var(--destructive)';
	}
}

export type DataPoint = Record<string, Date | number>;

const CHART_COLORS = ['chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5'];

function getLabelKey(vec: RangeVector): string {
	const labels = vec.metric.labels as Record<string, string>;
	const values = Object.values(labels);
	if (values.length === 0) return 'value';
	// Preserve verbatim for single-label series (histogram `le` values like "1.0"
	// need to survive — they aren't passed to layerchart's path-style accessor).
	if (values.length === 1) return values[0];
	// Multi-label series: pick a clean identifier or escape dots in the joined fallback
	// so layerchart's parsePath doesn't shred IPv4 addresses into nested-property reads.
	if (labels.pod) return labels.pod;
	if (labels.instance) return labels.instance.replace(/\./g, '_');
	return Object.entries(labels)
		.map(([k, v]) => `${k}=${v}`)
		.join(',')
		.replace(/\./g, '_');
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

/**
 * Tag every series produced by `expr` with `__series__="<name>"` so it can be
 * round-tripped through a unioned (`or`) PromQL query and split apart again.
 * Each query must yield a unique tag because PromQL `or` is set-union by label set.
 */
const COMBINED_TAG = '__series__';
function tagForCombine(name: string, expr: string): string {
	return `label_replace((${expr}), "${COMBINED_TAG}", "${name}", "", "")`;
}

/**
 * Run multiple named range queries as a SINGLE HTTP request — wraps each `expr`
 * with `label_replace` to tag it, then joins everything with `or`. Returns a flat
 * array of DataPoints keyed by the query name. Drop-in replacement for
 * `fetchMultipleFlattenedRange` when each query collapses to scalar/few series.
 *
 * Note: errors propagate (one failing sub-query may break the whole combined
 * query); callers should wrap in try/catch as they would for any other query.
 */
export async function fetchCombinedFlattenedRange(
	client: PrometheusDriver,
	queries: Record<string, string>,
	start: Date,
	end: Date,
	step: number
): Promise<DataPoint[]> {
	const combined = Object.entries(queries)
		.map(([name, q]) => tagForCombine(name, q))
		.join(' or ');
	const response = await client.rangeQuery(combined, start, end, `${step}s`);
	const vectors = response.result as RangeVector[];
	const dateMap = new Map<number, DataPoint>();
	for (const vector of vectors) {
		const name = (vector.metric.labels as Record<string, string>)[COMBINED_TAG];
		if (!name) continue;
		for (const sample of vector.values) {
			const time = (sample.time as Date).getTime();
			if (!dateMap.has(time)) dateMap.set(time, { date: sample.time as Date });
			dateMap.get(time)![name] = Number(sample.value);
		}
	}
	return Array.from(dateMap.values()).sort(
		(a, b) => (a.date as Date).getTime() - (b.date as Date).getTime()
	);
}

/**
 * Run multiple named instant queries as a SINGLE HTTP request.
 * Returns a record mapping each query name to its InstantVector list (after the
 * `__series__` tag has been stripped, so callers see the original label sets).
 *
 * On error, every named slot is set to `[]` so callers can deconstruct without
 * needing a try/catch per query — matching the lenient `instantNumber` /
 * `instantPerPod` pattern used in the dashboard.
 */
export async function fetchCombinedInstant(
	client: PrometheusDriver,
	queries: Record<string, string>
): Promise<Record<string, InstantVector[]>> {
	const result: Record<string, InstantVector[]> = {};
	for (const name of Object.keys(queries)) result[name] = [];
	const combined = Object.entries(queries)
		.map(([name, q]) => tagForCombine(name, q))
		.join(' or ');
	try {
		const response = await client.instantQuery(combined);
		for (const vector of response.result as InstantVector[]) {
			const labels = vector.metric.labels as Record<string, string>;
			const name = labels[COMBINED_TAG];
			if (!name || !(name in result)) continue;
			const { [COMBINED_TAG]: _omit, ...rest } = labels;
			void _omit;
			vector.metric.labels = rest;
			result[name].push(vector);
		}
	} catch {
		// leave all slots empty
	}
	return result;
}

/**
 * Build a sub-expression that yields one synthetic row per K8s node a given vLLM
 * model's pods occupy, with the `node` label renamed to `Hostname` so the result
 * can be intersected against DCGM / host-level metrics via `and on(Hostname)`.
 *
 * Lets DCGM queries scope to the model's hosts in a SINGLE PromQL request — no
 * preceding round-trip is needed to enumerate node names client-side.
 */
export function vllmModelHostnamesSelector(
	namespace: string | undefined,
	selectedModel: string
): string {
	const ns = (namespace ?? '').trim();
	const nsSel = ns ? `namespace="${escapePromqlStringLiteral(ns)}"` : '';
	const podInfoSelector = nsSel ? `{${nsSel}}` : '';
	const vllmSelector = vllmMetricWithSelector('vllm:kv_cache_usage_perc', namespace, selectedModel);
	return (
		`group by(Hostname) (` +
		`label_replace(` +
		`kube_pod_info${podInfoSelector}` +
		` * on(namespace, pod) group_left() ` +
		`group by(namespace, pod) (${vllmSelector}),` +
		` "Hostname", "$1", "node", "(.+)"))`
	);
}

/**
 * Label selector scoping DCGM (GPU exporter) series to one Kubernetes node. DCGM's
 * `Hostname` label equals the K8s node name (as vllmModelHostnamesSelector also assumes).
 * Exact match, not regex: node names can contain dots and would otherwise cross-match.
 */
export function dcgmNodeSelector(nodeName: string): string {
	return `Hostname="${escapePromqlStringLiteral(nodeName)}"`;
}

/**
 * Resolve the set of Kubernetes nodes a given vLLM model's pods currently run on.
 *
 * Joins `kube_pod_info` against `vllm:kv_cache_usage_perc` so we only keep pods
 * that belong to `selectedModel`, then returns the distinct `node` label values.
 * Used to scope DCGM/GPU queries (which lack pod-level labels) to the nodes the
 * model actually occupies.
 */
export async function fetchModelNodes(
	client: PrometheusDriver,
	namespace: string | undefined,
	selectedModel: string
): Promise<string[]> {
	const ns = (namespace ?? '').trim();
	const nsSel = ns ? `namespace="${escapePromqlStringLiteral(ns)}"` : '';
	const podInfoSelector = nsSel ? `{${nsSel}}` : '';
	const vllmSelector = vllmMetricWithSelector('vllm:kv_cache_usage_perc', namespace, selectedModel);
	const query =
		`group by(node) (` +
		`kube_pod_info${podInfoSelector}` +
		` * on(namespace, pod) group_left() ` +
		`group by(namespace, pod) (${vllmSelector}))`;
	try {
		const response = await client.instantQuery(query);
		const nodes = new Set<string>();
		for (const v of response.result) {
			const node = (v.metric.labels as Record<string, string>).node;
			if (node) nodes.add(node);
		}
		return Array.from(nodes);
	} catch {
		return [];
	}
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

import { InstantVector, type PrometheusDriver, RangeVector } from 'prometheus-query';

import type { ChartConfig } from '$lib/components/ui/chart/index.js';
import { m } from '$lib/messages';

/** Escape a value for use inside PromQL double-quoted string literals (e.g. `namespace="..."`). */
export function escapePromqlStringLiteral(value: string): string {
	return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

/**
 * Restrict a per-pod KSM selector to non-terminated pods — the set `kubectl describe node`
 * counts. KSM keeps emitting requests/limits for Succeeded/Failed pods until the object is
 * deleted, so finished Jobs otherwise pile up and inflate every sum.
 *
 * Append to a selector: `kube_pod_container_resource_limits{...} ${LIVE_PODS}`.
 */
export const LIVE_PODS =
	'and on (namespace, pod) (kube_pod_status_phase{phase=~"Pending|Running"} == 1)';

/**
 * Drop the containers that *do* declare a limit for `resource`, leaving the uncapped ones.
 * Counting what survives is the only way to tell a sum of limits from a ceiling: a container
 * with no limit contributes nothing to the sum, so a mostly-uncapped scope reports a small
 * number that reads like a tight bound.
 *
 * Matches on `container` as well as the pod, so a pod that caps some containers and not
 * others keeps only the uncapped ones. Append to a per-container selector:
 * `kube_pod_container_info ${LIVE_PODS} ${withoutLimit('memory')}`.
 */
export function withoutLimit(resource: string): string {
	return `unless on (namespace, pod, container) kube_pod_container_resource_limits{resource="${resource}"}`;
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

/**
 * Why a panel has nothing to draw. `absent` means the metric family produced no series
 * at all (nothing deployed, or not being scraped); `idle` means the series exist but the
 * workload saw no requests in the window. Collapsing both into "no data" hides a working
 * deployment behind the same message as a broken one.
 */
export type ActivityState = 'absent' | 'idle' | 'active';

/**
 * Classify a panel from a probe series — typically `sum(rate(<histogram>_count[5m]))`,
 * which yields no series when the metric is absent and a flat 0 when nothing is served.
 * Ride the probe along in the same combined query so it costs no extra request, then keep
 * it out of the chart data: a constant 0 is a valid data point and would defeat the
 * caller's `length === 0` empty check.
 */
export function probeActivity(points: DataPoint[], key: string): ActivityState {
	let present = false;
	for (const point of points) {
		const value = Number(point[key]);
		if (!Number.isFinite(value)) continue;
		present = true;
		if (value > 0) return 'active';
	}
	return present ? 'idle' : 'absent';
}

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
 * Record one sample under `key` in the flattened per-timestamp map, dropping values that
 * are not finite. `histogram_quantile` over an idle histogram returns NaN (0/0 during
 * interpolation), and NaN is not plottable — keeping it renders an empty chart whose
 * tooltips read "NaN". Dropping it lets callers fall back to their own empty state.
 */
function putSample(
	dateMap: Map<number, DataPoint>,
	key: string,
	sample: RangeVector['values'][number]
) {
	const value = Number(sample.value);
	if (!Number.isFinite(value)) return;
	const time = (sample.time as Date).getTime();
	if (!dateMap.has(time)) dateMap.set(time, { date: sample.time as Date });
	dateMap.get(time)![key] = value;
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
		for (const sample of vector.values) putSample(dateMap, key, sample);
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
			for (const sample of vector.values) putSample(dateMap, name, sample);
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
		for (const sample of vector.values) putSample(dateMap, name, sample);
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
 * Physical frame buffer per GPU card, in bytes (DCGM reports MiB). The honest denominator:
 * HAMi's `hami_gpu_memory_limit_bytes` is the scheduler's pool, which `deviceMemoryScaling`
 * can inflate past the card.
 */
export const DCGM_GPU_MEMORY_TOTAL_BYTES =
	'(DCGM_FI_DEV_FB_FREE + DCGM_FI_DEV_FB_RESERVED + DCGM_FI_DEV_FB_USED) * (1024 * 1024)';

/**
 * Frame buffer actually consumed by workloads, in bytes. Excludes `DCGM_FI_DEV_FB_RESERVED`,
 * the driver's own allocation (~457 MiB on an RTX 4000 Ada). HAMi's
 * `hami_host_gpu_memory_used_bytes` is total−free and includes it, so an idle card reads as a
 * few percent used forever.
 */
export const DCGM_GPU_MEMORY_USED_BYTES = 'DCGM_FI_DEV_FB_USED * (1024 * 1024)';

/**
 * TopoLVM device class backing the AI100 drive. `lvmd.deviceClasses` is a list, so queries name
 * the class explicitly rather than summing whatever else is configured.
 */
export const AI100_DEVICE_CLASS = 'aidaptiv';

/** Device classes are wiring, not product names — spell out the ones we ship. */
const DEVICE_CLASS_LABELS: Record<string, string> = { [AI100_DEVICE_CLASS]: 'AI100' };

export function deviceClassLabel(deviceClass: string): string {
	return DEVICE_CLASS_LABELS[deviceClass] ?? deviceClass;
}

/**
 * The AI100's block device as node_exporter sees it, matched on the drive model rather than a
 * device name: `nvme0n1` is not stable across machines, and the same node carries system SATA
 * SSDs and Ceph RBDs whose traffic must not be counted. TopoLVM's own series carry no device
 * label, so the model string is the only link to the hardware under the volume group.
 */
const AI100_DISK_INFO = 'node_disk_info{model=~"(?i).*ai100.*"}';

/**
 * Per-second rate of a node_exporter disk counter, restricted to AI100 drives. `and on(...)`
 * filters rather than joins, so the result keeps the counter's labels and doesn't depend on what
 * `node_disk_info` is worth.
 */
export function ai100DiskRate(counter: string, range = '5m'): string {
	return `rate(${counter}[${range}]) and on(instance, device) ${AI100_DISK_INFO}`;
}

/**
 * The same rate, summed per Kubernetes node and relabelled onto `node`. node_exporter keys its
 * series by `instance` (an IP:port), so nothing it exports lines up with kube-state-metrics on
 * its own; `node_uname_info` carries the only mapping between the two.
 */
export function ai100DiskRateByNode(counter: string, range = '5m'): string {
	return (
		`label_replace(sum by (nodename) (` +
		`(${ai100DiskRate(counter, range)}) * on(instance) group_left(nodename) node_uname_info` +
		`), "node", "$1", "nodename", "(.*)")`
	);
}

/**
 * Gap between what the HAMi scheduler booked on a card and what DCGM measures on it.
 *
 * - `unmanaged` — usage above the booking: something escaped HAMi's accounting, e.g. a pod
 *   setting `NVIDIA_VISIBLE_DEVICES=all` or `CUDA_DISABLE_CONTROL=true`.
 * - `idle` — booking far above usage: capacity reserved but unused.
 *
 * Per-card aggregates. DCGM carries no workload labels (its `pod`/`namespace` belong to the
 * exporter), so an escape can be surfaced but never attributed to a pod — and a large idle
 * booking on the same card can mask one. A signal, not an audit.
 */
export type GpuGovernance =
	| { level: 'managed' }
	| { level: 'idle'; bytes: number }
	| { level: 'unmanaged'; bytes: number };

/** Below this an excess is rounding noise: DCGM reports whole MiB, HAMi books whole MB. */
const GPU_UNMANAGED_TOLERANCE_BYTES = 256 * 1024 * 1024;
/** Idle bookings are only worth reporting once they cost about a GiB. */
const GPU_IDLE_TOLERANCE_BYTES = 1024 * 1024 * 1024;

/**
 * Classify one card from its HAMi booking and DCGM usage, both in bytes. Either being absent
 * means the comparison can't be made — no HAMi, or no DCGM — and yields `managed`, so callers
 * render nothing rather than a false finding.
 */
export function classifyGpuGovernance(allocated?: number, used?: number): GpuGovernance {
	if (
		allocated === undefined ||
		used === undefined ||
		!Number.isFinite(allocated) ||
		!Number.isFinite(used)
	) {
		return { level: 'managed' };
	}
	const excess = used - allocated;
	if (excess > GPU_UNMANAGED_TOLERANCE_BYTES) return { level: 'unmanaged', bytes: excess };
	if (-excess > GPU_IDLE_TOLERANCE_BYTES) return { level: 'idle', bytes: -excess };
	return { level: 'managed' };
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

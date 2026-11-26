import { escapePromqlStringLiteral, vllmMetricWithSelector } from '$lib/prometheus';

/**
 * PromQL for Model Analytics v2. Models are keyed `namespace/id` like Overview v2 (`id` is the
 * service, or `standalone:<model_name>`), and every per-model query is scoped to the model's own
 * namespace, so two Workspaces' `qwen` are never added together.
 */

/** One row per model, as in Overview v2. */
export const BY = 'namespace, llm_inference_service, model_name';

/** Requests, tokens and latency in Now look at the last five minutes, as Overview does. */
export const RATE = '5m';

/**
 * The rate window for a chart drawn every `stepSeconds`: five minutes, or the step when that is
 * longer, so the windows of neighbouring points meet and no traffic falls between two samples.
 */
export function rateWindow(stepSeconds: number): string {
	return `${Math.max(300, Math.round(stepSeconds))}s`;
}

export function splitKey(key: string): { namespace: string; id: string } {
	const slash = key.indexOf('/');
	return slash < 0
		? { namespace: '', id: key }
		: { namespace: key.slice(0, slash), id: key.slice(slash + 1) };
}

/** A vLLM metric for one model, e.g. `vllm:kv_cache_usage_perc{namespace="a",llm_inference_service="b"}`. */
export function modelMetric(metric: string, key: string): string {
	const { namespace, id } = splitKey(key);
	return vllmMetricWithSelector(metric, namespace, id);
}

/** `namespace="a",pod=~"p1|p2"`; pod names are DNS labels, so only the dots need escaping. */
export function podSelector(namespace: string, pods: string[], extra = ''): string {
	const re = pods.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '^$';
	const parts = [
		`namespace="${escapePromqlStringLiteral(namespace)}"`,
		`pod=~"${escapePromqlStringLiteral(re)}"`
	];
	if (extra) parts.push(extra);
	return `{${parts.join(',')}}`;
}

const quantile = (q: number, bucket: string, window: string, by = '') =>
	`histogram_quantile(${q}, sum by (le${by ? `, ${by}` : ''}) (rate(${bucket}[${window}])))`;

const quantileOver = (q: number, bucket: string, range: string, by = '') =>
	`histogram_quantile(${q}, sum by (le${by ? `, ${by}` : ''}) (increase(${bucket}[${range}])))`;

const sel = (metric: string, namespace: string) =>
	vllmMetricWithSelector(metric, namespace, undefined);

export type RankField =
	| 'rps'
	| 'gen'
	| 'prompt'
	| 'running'
	| 'waiting'
	| 'kvAvg'
	| 'kvMax'
	| 'e2eP99'
	| 'ttftP99'
	| 'windowRequests'
	| 'pods';

/** How rows that share a model key combine. */
export const RANK_COMBINE: Record<RankField, 'sum' | 'max'> = {
	rps: 'sum',
	gen: 'sum',
	prompt: 'sum',
	running: 'sum',
	waiting: 'sum',
	kvAvg: 'max',
	kvMax: 'max',
	e2eP99: 'max',
	ttftP99: 'max',
	windowRequests: 'sum',
	pods: 'sum'
};

/**
 * The ranking's numbers, one series per model. Now reads the last five minutes (traffic over the
 * last hour); History averages over the window: rates over the whole range, gauges through
 * `avg_over_time`, percentiles from the range's histogram.
 */
export function rankingQueries(
	namespace: string,
	history: { range: string; step: number } | undefined
): Record<RankField, string> {
	const s = (m: string) => sel(m, namespace);
	if (!history) {
		const rate = (m: string) => `sum by (${BY}) (rate(${s(m)}[${RATE}]))`;
		return {
			rps: rate('vllm:request_success_total'),
			gen: rate('vllm:generation_tokens_total'),
			prompt: rate('vllm:prompt_tokens_total'),
			running: `sum by (${BY}) (${s('vllm:num_requests_running')})`,
			waiting: `sum by (${BY}) (${s('vllm:num_requests_waiting')})`,
			kvAvg: `avg by (${BY}) (${s('vllm:kv_cache_usage_perc')}) * 100`,
			kvMax: `max by (${BY}) (${s('vllm:kv_cache_usage_perc')}) * 100`,
			e2eP99: quantile(0.99, s('vllm:e2e_request_latency_seconds_bucket'), RATE, BY),
			ttftP99: quantile(0.99, s('vllm:time_to_first_token_seconds_bucket'), RATE, BY),
			windowRequests: `sum by (${BY}) (increase(${s('vllm:request_success_total')}[1h]))`,
			pods: `count by (${BY}) (${s('vllm:kv_cache_usage_perc')})`
		};
	}
	const { range, step } = history;
	const rate = (m: string) => `sum by (${BY}) (rate(${s(m)}[${range}]))`;
	const avg = (q: string) => `avg_over_time((${q})[${range}:${step}s])`;
	return {
		rps: rate('vllm:request_success_total'),
		gen: rate('vllm:generation_tokens_total'),
		prompt: rate('vllm:prompt_tokens_total'),
		running: avg(`sum by (${BY}) (${s('vllm:num_requests_running')})`),
		waiting: avg(`sum by (${BY}) (${s('vllm:num_requests_waiting')})`),
		kvAvg: avg(`avg by (${BY}) (${s('vllm:kv_cache_usage_perc')}) * 100`),
		kvMax: avg(`max by (${BY}) (${s('vllm:kv_cache_usage_perc')}) * 100`),
		e2eP99: quantileOver(0.99, s('vllm:e2e_request_latency_seconds_bucket'), range, BY),
		ttftP99: quantileOver(0.99, s('vllm:time_to_first_token_seconds_bucket'), range, BY),
		windowRequests: `sum by (${BY}) (increase(${s('vllm:request_success_total')}[${range}]))`,
		pods: `count by (${BY}) (last_over_time(${s('vllm:kv_cache_usage_perc')}[${range}]))`
	};
}

/** Requests per second by model, for the ranking's small lines in History. */
export function rpsTrendQuery(namespace: string, window = RATE): string {
	return `sum by (${BY}) (rate(${sel('vllm:request_success_total', namespace)}[${window}]))`;
}

/** The five number cards of Now, for one model. */
export function nowCardQueries(key: string): Record<string, string> {
	const m = (metric: string) => modelMetric(metric, key);
	const latency = (name: 'ttft' | 'tpot') => {
		const q = percentileQueries(key, LATENCY[name]);
		return { [`${name}P95`]: q.p95, [`${name}P99`]: q.p99, [`${name}Mean`]: q.mean };
	};
	return {
		rps: `sum(rate(${m('vllm:request_success_total')}[${RATE}]))`,
		running: `sum(${m('vllm:num_requests_running')})`,
		waiting: `sum(${m('vllm:num_requests_waiting')})`,
		gen: `sum(rate(${m('vllm:generation_tokens_total')}[${RATE}]))`,
		prompt: `sum(rate(${m('vllm:prompt_tokens_total')}[${RATE}]))`,
		kvAvg: `avg(${m('vllm:kv_cache_usage_perc')}) * 100`,
		kvMax: `max(${m('vllm:kv_cache_usage_perc')}) * 100`,
		preemptions: `sum(increase(${m('vllm:num_preemptions_total')}[24h]))`,
		...latency('ttft'),
		...latency('tpot')
	};
}

function meanOf(sum: string, count: string, window: string): string {
	return `sum(rate(${sum}[${window}])) / sum(rate(${count}[${window}]))`;
}

/** The engine's numbers for each pod of a model (Pods table). */
export function podEngineQueries(key: string): Record<string, string> {
	const m = (metric: string) => modelMetric(metric, key);
	return {
		running: `sum by (pod) (${m('vllm:num_requests_running')})`,
		waiting: `sum by (pod) (${m('vllm:num_requests_waiting')})`,
		kv: `max by (pod) (${m('vllm:kv_cache_usage_perc')}) * 100`,
		gen: `sum by (pod) (rate(${m('vllm:generation_tokens_total')}[${RATE}]))`
	};
}

/** Kubernetes numbers for the listed pods (Pods table): memory of the engine container, restarts. */
export function podKubeQueries(
	namespace: string,
	pods: string[],
	container: string
): Record<string, string> {
	const c = `container="${escapePromqlStringLiteral(container)}"`;
	return {
		memUsed: `sum by (pod) (container_memory_working_set_bytes${podSelector(namespace, pods, c)})`,
		memLimit: `sum by (pod) (kube_pod_container_resource_limits${podSelector(namespace, pods, `${c},resource="memory"`)})`,
		restarts: `sum by (pod) (increase(kube_pod_container_status_restarts_total${podSelector(namespace, pods)}[24h]))`
	};
}

/** Faults over the last 24 hours, every pod of the model (Health). */
export function healthQueries(
	namespace: string,
	pods: string[],
	container: string
): Record<string, string> {
	const all = podSelector(namespace, pods);
	const engine = podSelector(
		namespace,
		pods,
		`container="${escapePromqlStringLiteral(container)}"`
	);
	return {
		restarts: `sum(increase(kube_pod_container_status_restarts_total${all}[24h]))`,
		oom: `sum(increase(container_oom_events_total${all}[24h]))`,
		throttle:
			`sum(increase(container_cpu_cfs_throttled_periods_total${engine}[24h]))` +
			` / sum(increase(container_cpu_cfs_periods_total${engine}[24h])) * 100`,
		// 135 = 128 + SIGBUS: a write to a full /dev/shm. Counted from each container's last exit.
		shm: `count(kube_pod_container_status_last_terminated_exitcode${all} == 135)`
	};
}

/** The engine's configuration, as vLLM reports it. */
export function engineConfigQueries(key: string): Record<string, string> {
	return {
		cache: modelMetric('vllm:cache_config_info', key),
		offload: modelMetric('vllm:kv_offload_config_info', key)
	};
}

/** History summary strip: one instant at the end of the window. */
export function summaryQueries(key: string, range: string, step: number): Record<string, string> {
	const m = (metric: string) => modelMetric(metric, key);
	const rps = `sum(rate(${m('vllm:request_success_total')}[${rateWindow(step)}]))`;
	const waiting = `sum(${m('vllm:num_requests_waiting')})`;
	return {
		rpsAvg: `sum(rate(${m('vllm:request_success_total')}[${range}]))`,
		rpsPeak: `max_over_time((${rps})[${range}:${step}s])`,
		waitingPeak: `max_over_time((${waiting})[${range}:${step}s])`,
		preemptions: `sum(increase(${m('vllm:num_preemptions_total')}[${range}]))`,
		ttft: quantileOver(0.95, m('vllm:time_to_first_token_seconds_bucket'), range),
		tpot: quantileOver(0.95, m('vllm:request_time_per_output_token_seconds_bucket'), range),
		e2e: quantileOver(0.95, m('vllm:e2e_request_latency_seconds_bucket'), range)
	};
}

/** p99, p95 and mean of one latency histogram over time. */
export function percentileQueries(
	key: string,
	base: string,
	window = RATE
): Record<'p99' | 'p95' | 'mean', string> {
	const m = (suffix: string) => modelMetric(`${base}_${suffix}`, key);
	return {
		p99: quantile(0.99, m('bucket'), window),
		p95: quantile(0.95, m('bucket'), window),
		mean: meanOf(m('sum'), m('count'), window)
	};
}

export const LATENCY = {
	ttft: 'vllm:time_to_first_token_seconds',
	tpot: 'vllm:request_time_per_output_token_seconds',
	e2e: 'vllm:e2e_request_latency_seconds'
} as const;

export function throughputQueries(
	key: string,
	window = RATE
): Record<'prompt' | 'generation', string> {
	return {
		prompt: `sum(rate(${modelMetric('vllm:prompt_tokens_total', key)}[${window}]))`,
		generation: `sum(rate(${modelMetric('vllm:generation_tokens_total', key)}[${window}]))`
	};
}

export function activeQueries(key: string): Record<'running' | 'waiting', string> {
	return {
		running: `sum(${modelMetric('vllm:num_requests_running', key)})`,
		waiting: `sum(${modelMetric('vllm:num_requests_waiting', key)})`
	};
}

export function kvPerPodQuery(key: string): string {
	return `max by (pod) (${modelMetric('vllm:kv_cache_usage_perc', key)}) * 100`;
}

export function genPerPodQuery(key: string, window = RATE): string {
	return `sum by (pod) (rate(${modelMetric('vllm:generation_tokens_total', key)}[${window}]))`;
}

export function prefillDecodeQueries(
	key: string,
	window = RATE
): Record<'prefill' | 'decode', string> {
	return {
		prefill: quantile(0.95, modelMetric('vllm:request_prefill_time_seconds_bucket', key), window),
		decode: quantile(0.95, modelMetric('vllm:request_decode_time_seconds_bucket', key), window)
	};
}

/**
 * Prefix cache hits by tier: the prompt tokens vLLM served from each source, over every prompt
 * token. `device` is the GPU's prefix cache, `host` the CPU offload, `disk` aiDAPTIVCache, and
 * `p2p` KV fetched from another pod (peer-to-peer KV sharing).
 */
export const CACHE_TIERS = [
	{ key: 'gpu', source: 'device' },
	{ key: 'cpu', source: 'host' },
	{ key: 'disk', source: 'disk' },
	{ key: 'p2p', source: 'p2p' }
] as const;

export type CacheTier = (typeof CACHE_TIERS)[number]['key'];

export function cacheTierQueries(key: string, window = RATE): Record<CacheTier, string> {
	const { namespace, id } = splitKey(key);
	const total = `sum(rate(${modelMetric('vllm:prompt_tokens_total', key)}[${window}]))`;
	const out = {} as Record<CacheTier, string>;
	for (const tier of CACHE_TIERS) {
		const base = vllmMetricWithSelector('vllm:prompt_tokens_cached_by_source_total', namespace, id);
		const metric = base.replace(/}$/, `,source="${tier.source}"}`);
		out[tier.key] = `sum(rate(${metric}[${window}])) / ${total} * 100`;
	}
	return out;
}

/** Finished requests per bucket by vLLM's `finished_reason`. */
export function finishReasonQuery(key: string, bucketSeconds: number): string {
	return `sum by (finished_reason) (increase(${modelMetric('vllm:request_success_total', key)}[${bucketSeconds}s]))`;
}

/** Requests per token-length bucket, per time bucket (cumulative by `le`). */
export function lengthHistogramQuery(key: string, bucket: string, bucketSeconds: number): string {
	return `sum by (le) (increase(${modelMetric(bucket, key)}[${bucketSeconds}s]))`;
}

/**
 * Memory of the engine container per pod over time, for the pods the engine reported at each
 * step, and the largest limit among them.
 */
export function memoryPerPodQueries(
	key: string,
	container: string
): Record<'used' | 'limit', string> {
	const { namespace } = splitKey(key);
	const join = `* on (namespace, pod) group_left () group by (namespace, pod) (${modelMetric('vllm:kv_cache_usage_perc', key)})`;
	const c = `namespace="${escapePromqlStringLiteral(namespace)}",container="${escapePromqlStringLiteral(container)}"`;
	return {
		used: `sum by (pod) (container_memory_working_set_bytes{${c}} ${join})`,
		limit: `max(kube_pod_container_resource_limits{${c},resource="memory"} ${join})`
	};
}

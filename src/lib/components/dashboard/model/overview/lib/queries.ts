import type { Sample } from '$lib/components/dashboard/kit/fetch';
import { escapePromqlStringLiteral, vllmMetricWithSelector } from '$lib/prometheus';

import { modelKey, modelKeyFromLabels, type ModelRow } from './models';

/** One row per model: the same identity the Analytics model picker uses, within a namespace. */
const BY = 'namespace, llm_inference_service, model_name';

/** p95 latency, requests and tokens look at the last five minutes, as the old panels did. */
const RATE = '5m';

export type InstantField =
	| 'rps'
	| 'gen'
	| 'prompt'
	| 'ttft'
	| 'tpot'
	| 'e2e'
	| 'kv'
	| 'waiting'
	| 'windowRequests'
	| 'pods';

/** How rows that share a model key combine: rates add up, levels and quantiles take the worst. */
export const COMBINE: Record<InstantField, 'sum' | 'max'> = {
	rps: 'sum',
	gen: 'sum',
	prompt: 'sum',
	ttft: 'max',
	tpot: 'max',
	e2e: 'max',
	kv: 'max',
	waiting: 'sum',
	windowRequests: 'sum',
	pods: 'sum'
};

function rateBy(metric: string, namespace: string): string {
	return `sum by (${BY}) (rate(${vllmMetricWithSelector(metric, namespace, undefined)}[${RATE}]))`;
}

function p95By(metric: string, namespace: string): string {
	const inner = vllmMetricWithSelector(metric, namespace, undefined);
	return `histogram_quantile(0.95, sum by (le, ${BY}) (rate(${inner}[${RATE}])))`;
}

/** Requests per second by model (also the Requests chart and the 1 h sparklines). */
export function rpsQuery(namespace: string): string {
	return rateBy('vllm:request_success_total', namespace);
}

/** The busiest pod's KV cache by model, in percent (also the KV chart). */
export function kvQuery(namespace: string): string {
	return `max by (${BY}) (${vllmMetricWithSelector('vllm:kv_cache_usage_perc', namespace, undefined)}) * 100`;
}

/** Every number in the table and the strip, read at the end of the window. */
export function instantQueries(namespace: string, range: string): Record<InstantField, string> {
	const sel = (metric: string) => vllmMetricWithSelector(metric, namespace, undefined);
	return {
		rps: rpsQuery(namespace),
		gen: rateBy('vllm:generation_tokens_total', namespace),
		prompt: rateBy('vllm:prompt_tokens_total', namespace),
		ttft: p95By('vllm:time_to_first_token_seconds_bucket', namespace),
		tpot: p95By('vllm:request_time_per_output_token_seconds_bucket', namespace),
		e2e: p95By('vllm:e2e_request_latency_seconds_bucket', namespace),
		kv: kvQuery(namespace),
		waiting: `sum by (${BY}) (${sel('vllm:num_requests_waiting')})`,
		windowRequests: `sum by (${BY}) (increase(${sel('vllm:request_success_total')}[${range}]))`,
		pods: `count by (${BY}) (${sel('vllm:kv_cache_usage_perc')})`
	};
}

/** Desired replicas of the models' primary Deployments, from kube-state-metrics. */
export function desiredQuery(namespace: string, deployments: string[]): string | undefined {
	const names = [...new Set(deployments.filter(Boolean))];
	if (names.length === 0) return undefined;
	const re = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
	const parts = [`deployment=~"${escapePromqlStringLiteral(re)}"`];
	if (namespace) parts.unshift(`namespace="${escapePromqlStringLiteral(namespace)}"`);
	return `max by (namespace, deployment) (kube_deployment_spec_replicas{${parts.join(',')}})`;
}

export type { Sample };

/** Fold samples into one value per model key; NaN (an idle histogram) counts as no value. */
export function byModel(samples: Sample[], combine: 'sum' | 'max'): Map<string, number> {
	const out = new Map<string, number>();
	for (const { labels, value } of samples) {
		if (!Number.isFinite(value)) continue;
		const key = modelKeyFromLabels(labels);
		const prev = out.get(key);
		out.set(
			key,
			prev === undefined ? value : combine === 'sum' ? prev + value : Math.max(prev, value)
		);
	}
	return out;
}

/** Desired replicas by `namespace/deployment`, from the kube-state-metrics answer. */
export function desiredByDeployment(samples: Sample[]): Map<string, number> {
	const out = new Map<string, number>();
	for (const { labels, value } of samples) {
		if (Number.isFinite(value)) out.set(`${labels.namespace}/${labels.deployment}`, value);
	}
	return out;
}

/** An LLMInferenceService as the table needs it. */
export type ManagedModel = {
	namespace: string;
	name: string;
	/** `status.workloads.primary.readyReplicas`. */
	readyReplicas?: number;
	/** `status.workloads.primary.name`, the Deployment that serves it. */
	deployment?: string;
	/** `spec.replicas`; usually unset when the replicas come from a baseRef. */
	specReplicas?: number;
};

/** Read what the table needs from a listed LLMInferenceService object. */
export function managedModelFromObject(object: unknown): ManagedModel | undefined {
	const o = object as {
		metadata?: { name?: unknown; namespace?: unknown };
		spec?: { replicas?: unknown };
		status?: { workloads?: { primary?: { name?: unknown; readyReplicas?: unknown } } };
	};
	const name = o?.metadata?.name;
	const namespace = o?.metadata?.namespace;
	if (typeof name !== 'string' || !name || typeof namespace !== 'string') return undefined;
	const primary = o.status?.workloads?.primary;
	const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
	return {
		namespace,
		name,
		readyReplicas: num(primary?.readyReplicas),
		deployment: typeof primary?.name === 'string' ? primary.name : undefined,
		specReplicas: num(o.spec?.replicas)
	};
}

/**
 * Join the listed models with the engine's numbers. Managed models come from the API, ready from
 * their status and desired from kube-state-metrics (spec.replicas when that is missing). A
 * standalone vLLM has no object, so it appears while the engine reports and counts its pods as
 * both ready and desired.
 */
export function buildRows(
	managed: ManagedModel[] | undefined,
	metrics: Partial<Record<InstantField, Map<string, number>>>,
	desired: Map<string, number>
): ModelRow[] {
	const rows = new Map<string, ModelRow>();
	for (const m of managed ?? []) {
		const key = modelKey(m.namespace, m.name);
		rows.set(key, {
			key,
			name: m.name,
			namespace: m.namespace,
			ready: m.readyReplicas ?? 0,
			// KServe's own default is one replica, for when neither source has a number.
			desired:
				(m.deployment ? desired.get(`${m.namespace}/${m.deployment}`) : undefined) ??
				m.specReplicas ??
				1
		});
	}
	// A model the engine reports right now. Older series (a model removed inside the window) are
	// left out: they would sit in the table as idle forever.
	const live = new Set([...(metrics.pods?.keys() ?? []), ...(metrics.kv?.keys() ?? [])]);
	for (const key of live) {
		if (rows.has(key)) continue;
		const slash = key.indexOf('/');
		const namespace = key.slice(0, slash);
		const id = key.slice(slash + 1);
		const standalone = id.startsWith('standalone:');
		// Without a list of objects (the API failed) a managed model still shows, its replicas unknown.
		const pods = metrics.pods?.get(key);
		rows.set(key, {
			key,
			name: standalone ? id.slice('standalone:'.length) || '(unknown)' : id,
			namespace,
			ready: standalone ? pods : managed ? 0 : undefined,
			desired: standalone ? pods : undefined
		});
	}
	for (const row of rows.values()) {
		for (const field of Object.keys(COMBINE) as InstantField[]) {
			if (field === 'pods') continue;
			const v = metrics[field]?.get(row.key);
			if (v !== undefined) row[field] = v;
		}
	}
	return [...rows.values()];
}

/** Workspace name by its namespace, from listed Workspace objects. */
export function workspaceByNamespace(objects: unknown[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const object of objects) {
		const o = object as { metadata?: { name?: unknown }; spec?: { namespace?: unknown } };
		const name = o?.metadata?.name;
		const ns = o?.spec?.namespace;
		if (typeof name === 'string' && name && typeof ns === 'string' && ns) out[ns] = name;
	}
	return out;
}

/** The least of the Resource API this page needs, so the listing is tested without a transport. */
type ResourceLister = {
	list(request: {
		cluster: string;
		group: string;
		version: string;
		resource: string;
		namespace: string;
	}): Promise<{ items: { object?: unknown }[] }>;
};

/** The LLMInferenceServices of a namespace ('' for all); rejects when the list cannot be read. */
export async function listManagedModels(
	client: ResourceLister,
	cluster: string,
	namespace: string
): Promise<ManagedModel[]> {
	const response = await client.list({
		cluster,
		group: 'serving.kserve.io',
		version: 'v1alpha2',
		resource: 'llminferenceservices',
		namespace
	});
	return response.items
		.map((item) => managedModelFromObject(item.object))
		.filter((x): x is ManagedModel => x !== undefined);
}

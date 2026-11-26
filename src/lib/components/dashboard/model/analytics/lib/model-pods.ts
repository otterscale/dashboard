import type { Client } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';
import type { PrometheusDriver } from 'prometheus-query';

import { fetchInstant } from '$lib/components/dashboard/kit/fetch';

import { podFromObject, type PodInfo } from './pods';
import { modelMetric, splitKey } from './queries';

export type ModelPods = {
	pods: PodInfo[];
	/** The engine container's name, for the Kubernetes queries. */
	container: string;
};

/**
 * A model's replicas. A managed model's pods come from Kubernetes by the labels KServe puts on its
 * workload, so a replica that is still starting (and reports nothing to Prometheus yet) is listed
 * too. A standalone vLLM has no such labels: its pods are the ones its metrics name.
 * Resolves null when neither source answered.
 */
export async function fetchModelPods(
	resources: Client<typeof ResourceService>,
	client: PrometheusDriver,
	cluster: string,
	key: string
): Promise<ModelPods | null> {
	const { namespace, id } = splitKey(key);
	const standalone = id.startsWith('standalone:');

	const reported = await fetchInstant(client, {
		pods: `group by (pod, container) (${modelMetric('vllm:kv_cache_usage_perc', key)})`
	});
	const named = new Map((reported?.pods ?? []).map((s) => [s.labels.pod, s.labels.container]));
	const hint = [...named.values()].find(Boolean);

	let objects: unknown[] | undefined;
	try {
		const response = await resources.list({
			cluster,
			group: '',
			version: 'v1',
			resource: 'pods',
			namespace,
			labelSelector: standalone
				? ''
				: `app.kubernetes.io/name=${id},app.kubernetes.io/component=llminferenceservice-workload`
		});
		objects = response.items.map((item) => item.object);
	} catch (error) {
		console.error('Failed to list the model pods:', error);
	}
	if (objects === undefined && !reported) return null;

	let pods = (objects ?? [])
		.map((o) => podFromObject(o, hint))
		.filter((p): p is PodInfo => p !== undefined);
	// Standalone, or a managed model whose pods carry other labels: keep the pods the engine names.
	if (standalone || (pods.length === 0 && named.size > 0)) {
		if (!standalone && objects !== undefined) {
			// The labelled list was empty: look the reported pods up in the whole namespace.
			try {
				const response = await resources.list({
					cluster,
					group: '',
					version: 'v1',
					resource: 'pods',
					namespace
				});
				objects = response.items.map((item) => item.object);
			} catch {
				objects = [];
			}
		}
		pods = (objects ?? [])
			.map((o) => podFromObject(o, hint))
			.filter((p): p is PodInfo => p !== undefined && named.has(p.name));
		if (pods.length === 0) {
			// No Kubernetes objects to read: the names alone.
			pods = [...named.keys()].map((name) => ({
				name,
				namespace,
				status: { key: 'other', tone: 'muted' },
				argv: [],
				hami: []
			}));
		}
	}
	pods.sort((a, b) => a.name.localeCompare(b.name));
	return { pods, container: hint ?? pods.find((p) => p.container)?.container ?? 'main' };
}

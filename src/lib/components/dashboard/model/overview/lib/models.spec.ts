import { describe, expect, it } from 'vitest';

import {
	chartModels,
	DASH,
	fmtMillis,
	fmtRate,
	fmtReplicas,
	fmtSeconds,
	kvTone,
	modelColors,
	modelKey,
	type ModelRow,
	modelStatus,
	niceTop,
	pickerId,
	sortModels,
	summarize
} from './models';
import {
	buildRows,
	byModel,
	desiredQuery,
	instantQueries,
	managedModelFromObject,
	workspaceByNamespace
} from './queries';

function row(over: Partial<ModelRow> & { name: string }): ModelRow {
	return {
		key: modelKey('ns', over.name),
		namespace: 'ns',
		ready: 1,
		desired: 1,
		windowRequests: 10,
		rps: 1,
		...over
	};
}

describe('modelStatus', () => {
	it('is Starting while no replica is ready', () => {
		expect(modelStatus(row({ name: 'a', ready: 0, desired: 1 }))).toEqual({
			state: 'starting',
			tone: 'warn'
		});
	});

	it('is not Starting once one of several replicas is ready', () => {
		expect(modelStatus(row({ name: 'a', ready: 1, desired: 2 })).state).toBe('serving');
	});

	it('Starting wins over a full KV cache', () => {
		expect(modelStatus(row({ name: 'a', ready: 0, desired: 1, kv: 95 })).state).toBe('starting');
	});

	it('is Queueing in the critical colour when the busiest pod is at 90 % KV or more', () => {
		expect(modelStatus(row({ name: 'a', kv: 90, waiting: 0 }))).toEqual({
			state: 'queueing',
			tone: 'bad'
		});
	});

	it('is Queueing in the warning colour when requests are waiting', () => {
		expect(modelStatus(row({ name: 'a', kv: 40, waiting: 3 }))).toEqual({
			state: 'queueing',
			tone: 'warn'
		});
	});

	it('Queueing wins over No traffic', () => {
		expect(modelStatus(row({ name: 'a', windowRequests: 0, waiting: 1 })).state).toBe('queueing');
	});

	it('is No traffic when the window saw no request', () => {
		expect(modelStatus(row({ name: 'a', windowRequests: 0 }))).toEqual({
			state: 'idle',
			tone: 'muted'
		});
		expect(modelStatus(row({ name: 'a', windowRequests: undefined })).state).toBe('idle');
	});

	it('is Serving otherwise, with 80 % KV still Serving', () => {
		expect(modelStatus(row({ name: 'a', kv: 85 }))).toEqual({ state: 'serving', tone: 'ok' });
	});

	it('cannot call a model Starting when its desired count is unknown', () => {
		expect(modelStatus(row({ name: 'a', ready: undefined, desired: undefined })).state).toBe(
			'serving'
		);
	});
});

describe('sortModels', () => {
	it('puts Starting and Queueing first, then busiest by requests per second', () => {
		const sorted = sortModels([
			row({ name: 'quiet', rps: 0.1 }),
			row({ name: 'busy', rps: 9 }),
			row({ name: 'queued', rps: 1, waiting: 2 }),
			row({ name: 'idle', rps: 0, windowRequests: 0 }),
			row({ name: 'starting', ready: 0, desired: 1, rps: undefined })
		]);
		expect(sorted.map((r) => r.name)).toEqual(['queued', 'starting', 'busy', 'quiet', 'idle']);
	});

	it('breaks ties by name', () => {
		const sorted = sortModels([row({ name: 'b', rps: 1 }), row({ name: 'a', rps: 1 })]);
		expect(sorted.map((r) => r.name)).toEqual(['a', 'b']);
	});
});

describe('modelColors', () => {
	it('follows the sorted names, not the order given, standalone models included', () => {
		const a = modelColors(['ns/c', 'ns/standalone:bge', 'ns/a', 'ns/b']);
		expect(a.get('ns/standalone:bge')).toBe('var(--chart-8)');
		const b = modelColors(['ns/b', 'ns/c', 'ns/a', 'ns/standalone:bge']);
		expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
		expect(a.get('ns/a')).toBe('var(--chart-6)');
		expect(a.get('ns/c')).toBe('var(--chart-9)');
	});

	it('colours four models at most', () => {
		const colors = modelColors(['ns/a', 'ns/b', 'ns/c', 'ns/d', 'ns/e']);
		expect(colors.size).toBe(4);
		expect(colors.has('ns/e')).toBe(false);
	});
});

describe('chartModels', () => {
	it('picks the four busiest by requests in the window, ties by name', () => {
		const requests = new Map([
			['ns/a', 1],
			['ns/b', 50],
			['ns/c', 20],
			['ns/d', 20],
			['ns/e', 30]
		]);
		expect(chartModels(['ns/a', 'ns/b', 'ns/c', 'ns/d', 'ns/e', 'ns/f'], requests)).toEqual([
			'ns/b',
			'ns/e',
			'ns/c',
			'ns/d'
		]);
	});

	it('keeps colours by name among the chosen, whatever their rank', () => {
		const chosen = chartModels(['ns/z', 'ns/a'], new Map([['ns/z', 9]]));
		expect(chosen).toEqual(['ns/z', 'ns/a']);
		expect(modelColors(chosen).get('ns/a')).toBe('var(--chart-6)');
	});
});

describe('summarize', () => {
	it('counts serving and starting, adds rates and names where requests wait', () => {
		const s = summarize([
			row({ name: 'a', rps: 2, gen: 100, prompt: 400, waiting: 0, kv: 30 }),
			row({ name: 'b', rps: 1.5, gen: 50, prompt: 100, waiting: 6, kv: 96 }),
			row({ name: 'c', ready: 0, desired: 1, rps: undefined }),
			row({ name: 'd', rps: 0, waiting: 9 })
		]);
		expect(s).toMatchObject({
			total: 4,
			serving: 3,
			starting: 1,
			rps: 3.5,
			gen: 150,
			prompt: 500,
			waiting: 15,
			waitingIn: ['d', 'b'],
			kv: 96,
			kvModel: 'b'
		});
	});

	it('leaves totals undefined when no model reports them', () => {
		const s = summarize([row({ name: 'a', rps: undefined })]);
		expect(s.rps).toBeUndefined();
		expect(s.kv).toBeUndefined();
	});
});

describe('formats', () => {
	it('shows a dash for a missing latency, as for an embeddings model without TTFT', () => {
		const embeddings = row({ name: 'bge-m3', ttft: undefined, tpot: undefined, e2e: 0.06 });
		expect(fmtSeconds(embeddings.ttft)).toBe(DASH);
		expect(fmtMillis(embeddings.tpot)).toBe(DASH);
		expect(fmtSeconds(embeddings.e2e)).toBe('60 ms');
		expect(fmtSeconds(Number.NaN)).toBe(DASH);
	});

	it('formats seconds, milliseconds and rates like the design', () => {
		expect(fmtSeconds(1.94)).toBe('1.9 s');
		expect(fmtSeconds(24.2)).toBe('24 s');
		expect(fmtMillis(0.062)).toBe('62 ms');
		expect(fmtRate(0)).toBe('0.0');
		expect(fmtRate(6.84)).toBe('6.8');
		expect(fmtRate(240)).toBe('240');
		expect(fmtRate(1400)).toBe('1.4K');
		expect(fmtRate(11_000)).toBe('11K');
	});

	it('shows replicas as ready/desired', () => {
		expect(fmtReplicas(row({ name: 'a', ready: 0, desired: 1 }))).toBe('0/1');
		expect(fmtReplicas(row({ name: 'a', ready: 2, desired: undefined }))).toBe('2');
	});

	it('rounds the y axis top so its half is round too', () => {
		expect(niceTop(0)).toBe(1);
		expect(niceTop(13)).toBe(16);
		expect(niceTop(6)).toBe(6);
		expect(niceTop(0.42)).toBe(0.5);
	});

	it('colours KV at 80 and 90 %', () => {
		expect(kvTone(79)).toBeUndefined();
		expect(kvTone(80)).toBe('warn');
		expect(kvTone(90)).toBe('bad');
		expect(kvTone(undefined)).toBeUndefined();
	});
});

describe('queries', () => {
	it('groups every number by namespace, service and model name', () => {
		const q = instantQueries('db286l', '1h');
		expect(q.rps).toBe(
			'sum by (namespace, llm_inference_service, model_name) (rate(vllm:request_success_total{namespace="db286l"}[5m]))'
		);
		expect(q.kv).toContain(
			'max by (namespace, llm_inference_service, model_name) (vllm:kv_cache_usage_perc'
		);
		expect(q.tpot).toContain('vllm:request_time_per_output_token_seconds_bucket');
		expect(q.windowRequests).toContain('[1h]');
		expect(instantQueries('', '1h').rps).toContain('vllm:request_success_total{}');
	});

	it('asks kube-state-metrics for the listed Deployments only', () => {
		expect(desiredQuery('', [])).toBeUndefined();
		expect(desiredQuery('db286l', ['qwen-kserve', 'a.b'])).toBe(
			'max by (namespace, deployment) (kube_deployment_spec_replicas{namespace="db286l",deployment=~"qwen-kserve|a\\\\.b"})'
		);
	});

	it('merges model names under one service and skips NaN', () => {
		const m = byModel(
			[
				{ labels: { namespace: 'n', llm_inference_service: 's', model_name: 'x' }, value: 1 },
				{ labels: { namespace: 'n', llm_inference_service: 's', model_name: 'lora' }, value: 2 },
				{ labels: { namespace: 'n', llm_inference_service: 't', model_name: 't' }, value: NaN }
			],
			'sum'
		);
		expect(m.get('n/s')).toBe(3);
		expect(m.has('n/t')).toBe(false);
	});

	it('maps namespaces to Workspace names', () => {
		expect(
			workspaceByNamespace([
				{ metadata: { name: 'admin' }, spec: { namespace: 'db286l' } },
				{ metadata: { name: 'broken' } }
			])
		).toEqual({ db286l: 'admin' });
	});

	it('reads ready and the Deployment from an LLMInferenceService', () => {
		expect(
			managedModelFromObject({
				metadata: { name: 'qwen', namespace: 'db286l' },
				spec: {},
				status: { workloads: { primary: { name: 'qwen-kserve', readyReplicas: 1 } } }
			})
		).toEqual({
			namespace: 'db286l',
			name: 'qwen',
			readyReplicas: 1,
			deployment: 'qwen-kserve',
			specReplicas: undefined
		});
		expect(managedModelFromObject({})).toBeUndefined();
	});

	it('joins objects and metrics, with standalone models counted by their pods', () => {
		const rows = buildRows(
			[
				{ namespace: 'n', name: 'qwen', readyReplicas: 1, deployment: 'qwen-kserve' },
				{ namespace: 'n', name: 'new', readyReplicas: 0, deployment: 'new-kserve' }
			],
			{
				rps: new Map([['n/qwen', 2]]),
				pods: new Map([
					['n/qwen', 1],
					['m/standalone:llama', 2]
				]),
				kv: new Map([['n/qwen', 40]])
			},
			new Map([['n/qwen-kserve', 2]])
		);
		const by = Object.fromEntries(rows.map((r) => [r.key, r]));
		expect(by['n/qwen']).toMatchObject({ name: 'qwen', ready: 1, desired: 2, rps: 2, kv: 40 });
		expect(by['n/new']).toMatchObject({ ready: 0, desired: 1 });
		expect(by['m/standalone:llama']).toMatchObject({ name: 'llama', ready: 2, desired: 2 });
		expect(pickerId('m/standalone:llama')).toBe('standalone:llama');
	});
});

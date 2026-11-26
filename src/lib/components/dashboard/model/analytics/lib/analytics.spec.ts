import { describe, expect, it } from 'vitest';

import { colorsFor, finishGroup } from './chart-style';
import { bucketFor, finishBuckets, lengthGrid, perPod } from './history';
import {
	argValue,
	byNode,
	commandWords,
	engineVersion,
	fmtContextTokens,
	imageText,
	nodeTags,
	parseHamiAllocation,
	podFromObject,
	podGpuMemory,
	type PodInfo,
	podStatus,
	shortGpuName,
	splitTail
} from './pods';
import {
	cacheTierQueries,
	modelMetric,
	podSelector,
	rankingQueries,
	rateWindow,
	splitKey
} from './queries';
import { pickModel, rankBar, type RankedModel, rankMax, rankModels, tabFromParam } from './ranking';

const row = (over: Partial<RankedModel>): RankedModel => ({
	key: `ns/${over.name ?? 'm'}`,
	name: 'm',
	namespace: 'ns',
	ready: 1,
	desired: 1,
	windowRequests: 10,
	...over
});

describe('ranking', () => {
	it('orders by the tab, Starting and No traffic last', () => {
		const rows = [
			row({ name: 'idle', windowRequests: 0 }),
			row({ name: 'starting', ready: 0, desired: 1 }),
			row({ name: 'small', running: 1, waiting: 0, gen: 50 }),
			row({ name: 'busy', running: 3, waiting: 2, gen: 10 })
		];
		expect(rankModels(rows, 'requests').map((r) => r.name)).toEqual([
			'busy',
			'small',
			'starting',
			'idle'
		]);
		expect(rankModels(rows, 'throughput').map((r) => r.name)).toEqual([
			'small',
			'busy',
			'starting',
			'idle'
		]);
	});

	it('draws waiting after running, scaled to the busiest model', () => {
		const rows = [row({ running: 6, waiting: 2 }), row({ name: 'b', running: 4, waiting: 0 })];
		const max = rankMax(rows, 'requests');
		expect(max).toBe(8);
		expect(rankBar(rows[0], 'requests', max)).toEqual({ solid: 75, soft: 100 });
		expect(rankBar(rows[1], 'requests', max)).toEqual({ solid: 50, soft: undefined });
		expect(rankBar(row({ kvAvg: 91 }), 'kv', rankMax(rows, 'kv'))).toEqual({ solid: 91 });
	});

	it('reads the tab from the URL, Requests by default', () => {
		expect(tabFromParam('kv')).toBe('kv');
		expect(tabFromParam('nope')).toBe('requests');
		expect(tabFromParam(null)).toBe('requests');
	});

	it('picks the asked model, a bare id from an older link, or the first', () => {
		const keys = ['a/qwen', 'b/llama', 'b/standalone:org/x'];
		expect(pickModel(keys, 'b/llama')).toBe('b/llama');
		expect(pickModel(keys, 'llama')).toBe('b/llama');
		expect(pickModel(keys, 'standalone:org/x')).toBe('b/standalone:org/x');
		expect(pickModel(keys, 'gone/model')).toBe('a/qwen');
		expect(pickModel(keys, undefined)).toBe('a/qwen');
		expect(pickModel([], 'a/qwen')).toBeUndefined();
	});
});

describe('queries', () => {
	it('scopes a model to its own namespace', () => {
		expect(splitKey('ns/standalone:org/x')).toEqual({ namespace: 'ns', id: 'standalone:org/x' });
		expect(modelMetric('vllm:x', 'db/qwen')).toBe(
			'vllm:x{namespace="db",llm_inference_service="qwen"}'
		);
	});

	it('matches the listed pods only', () => {
		expect(podSelector('db', ['a-1', 'b.2'])).toBe('{namespace="db",pod=~"a-1|b\\\\.2"}');
		expect(podSelector('db', [])).toContain('pod=~"^$"');
	});

	it('averages gauges over the window in History', () => {
		const q = rankingQueries('', { range: '3600s', step: 60 });
		expect(q.running).toMatch(/^avg_over_time\(\(sum by .*\)\[3600s:60s\]\)$/);
		expect(q.e2eP99).toContain('increase(');
		expect(rankingQueries('', undefined).rps).toContain('[5m]');
	});

	it('widens the rate window to the gap between points', () => {
		expect(rateWindow(60)).toBe('300s');
		expect(rateWindow(10080)).toBe('10080s');
		expect(cacheTierQueries('db/qwen', rateWindow(10080)).p2p).toContain('[10080s]');
		expect(cacheTierQueries('db/qwen').gpu).toContain('[5m]');
	});

	it('reads cache tiers from vLLM prompt tokens by source', () => {
		const q = cacheTierQueries('db/qwen');
		expect(q.gpu).toContain('source="device"');
		expect(q.cpu).toContain('source="host"');
		expect(q.disk).toContain('source="disk"');
		expect(q.p2p).toContain('source="p2p"');
		expect(q.disk).toContain(
			'vllm:prompt_tokens_total{namespace="db",llm_inference_service="qwen"}'
		);
	});
});

describe('pods', () => {
	it('parses the HAMi allocation annotation', () => {
		expect(parseHamiAllocation('GPU-a,NVIDIA,97887,100:;')).toEqual([
			{ uuid: 'GPU-a', mib: 97887 }
		]);
		expect(parseHamiAllocation(';GPU-b,NVIDIA,1024,50:GPU-c,NVIDIA,2048,50:;;')).toEqual([
			{ uuid: 'GPU-b', mib: 1024 },
			{ uuid: 'GPU-c', mib: 2048 }
		]);
		expect(parseHamiAllocation(undefined)).toEqual([]);
	});

	it('reads engine flags from args and shell strings', () => {
		const argv = commandWords(
			['/bin/bash', '-c', 'exec vllm serve --max_model_len=8192'],
			['--tensor-parallel-size', '4']
		);
		expect(argValue(argv, '--tensor-parallel-size', '-tp')).toBe('4');
		expect(argValue(argv, '--max-model-len')).toBe('8192');
		expect(argValue(argv, '--pipeline-parallel-size')).toBeUndefined();
	});

	it('names the engine from the image tag, never from a digest', () => {
		const image = 'ghcr.io/phison-ai/vllm-openai:v0.33.0@sha256:cee3';
		expect(engineVersion(image)).toBe('vLLM 0.33.0');
		expect(imageText(image)).toBe('ghcr.io/phison-ai/vllm-openai:v0.33.0');
		expect(engineVersion('sha256:5dc2fc95')).toBeUndefined();
		expect(imageText('sha256:5dc2fc95')).toBeUndefined();
		expect(engineVersion('registry:5000/custom/engine:nightly')).toBe('nightly');
		expect(imageText('registry:5000/custom/engine')).toBe('registry:5000/custom/engine');
	});

	it('keeps the end of a name for a middle ellipsis', () => {
		expect(splitTail('redhatai-muse-kserve-7799fdd99f-4qsh8')).toEqual([
			'redhatai-muse-kserve',
			'-7799fdd99f-4qsh8'
		]);
		expect(splitTail('aiserver-nv-x8-210', 1)).toEqual(['aiserver-nv-x8', '-210']);
		expect(splitTail('short-name')).toEqual(['', 'short-name']);
	});

	it('formats token counts and GPU names', () => {
		expect(fmtContextTokens('32768')).toBe('32K');
		expect(fmtContextTokens('262144')).toBe('256K');
		expect(fmtContextTokens('8000')).toBe('8K');
		expect(fmtContextTokens('None')).toBeUndefined();
		expect(shortGpuName('NVIDIA RTX PRO 6000 Blackwell Server Edition')).toBe(
			'RTX PRO 6000 Blackwell'
		);
	});

	it('gives one status per pod', () => {
		const pod = (status: object, meta: object = {}) => ({
			metadata: { name: 'p', namespace: 'n', ...meta },
			status
		});
		expect(
			podStatus(
				pod({ phase: 'Running', containerStatuses: [{ name: 'main', ready: true }] }),
				'main'
			).key
		).toBe('running');
		expect(
			podStatus(
				pod({
					phase: 'Running',
					containerStatuses: [{ name: 'main', state: { waiting: { reason: 'CrashLoopBackOff' } } }]
				}),
				'main'
			)
		).toEqual({ key: 'crashLoop', tone: 'bad' });
		expect(
			podStatus(
				pod({
					phase: 'Pending',
					initContainerStatuses: [{ state: { running: {} } }],
					containerStatuses: [{ name: 'main', state: { waiting: { reason: 'PodInitializing' } } }]
				}),
				'main'
			).key
		).toBe('initializing');
		expect(podStatus(pod({ phase: 'Running' }, { deletionTimestamp: 'x' })).key).toBe(
			'terminating'
		);
	});

	it('shows GPU usage only for a card the pod has to itself', () => {
		const p = podFromObject({
			metadata: {
				name: 'p',
				namespace: 'n',
				annotations: { 'hami.io/vgpu-devices-allocated': 'GPU-a,NVIDIA,1024,100:;' }
			},
			spec: { containers: [{ name: 'main', resources: { limits: { 'nvidia.com/gpu': '1' } } }] }
		}) as PodInfo;
		expect(p.gpus).toBe(1);
		const used = new Map([['GPU-a', 512 * 1024 * 1024]]);
		expect(podGpuMemory(p, used, new Map([['GPU-a', 1]]))).toEqual({
			quota: 1024 ** 3,
			used: 512 * 1024 ** 2,
			shared: false
		});
		expect(podGpuMemory(p, used, new Map([['GPU-a', 2]]))).toEqual({
			quota: 1024 ** 3,
			shared: true
		});
	});
});

describe('history', () => {
	it('colours items by name, chart-6 to chart-9', () => {
		const c = colorsFor(['b', 'a']);
		expect(c.get('a')).toBe('var(--chart-6)');
		expect(c.get('b')).toBe('var(--chart-7)');
	});

	it('draws one line per pod', () => {
		const { data, series } = perPod([
			{ labels: { pod: 'm-kserve-7c9f4d-r7mn' }, points: [{ t: 1000, v: 2 }] },
			{ labels: { pod: 'm-kserve-7c9f4d-x2kq' }, points: [{ t: 1000, v: 3 }] }
		]);
		expect(series.map((s) => s.label)).toEqual(['…7c9f4d-r7mn', '…7c9f4d-x2kq']);
		expect(data).toEqual([{ date: new Date(1000), s0: 2, s1: 3 }]);
	});

	it('folds finish reasons into Stop, Length limit and Aborted', () => {
		expect(['stop', 'repetition', 'length', 'abort', 'error'].map(finishGroup)).toEqual([
			'stop',
			'stop',
			'length',
			'aborted',
			'aborted'
		]);
		const buckets = finishBuckets(
			[
				{ labels: { finished_reason: 'stop' }, points: [{ t: 600_000, v: 3 }] },
				{ labels: { finished_reason: 'error' }, points: [{ t: 600_000, v: 1 }] }
			],
			300
		);
		expect(buckets).toEqual([
			{ date: new Date(300_000), end: new Date(600_000), stop: 3, length: 0, aborted: 1 }
		]);
	});

	it('turns cumulative length buckets into bins', () => {
		const s = (le: string, v: number) => ({ labels: { le }, points: [{ t: 1, v }] });
		const grid = lengthGrid([s('10', 1), s('20', 2), s('50', 5), s('100', 5), s('+Inf', 9)]);
		expect(grid.bins).toEqual(['0–20', '20–50', '50–100', '> 100']);
		expect(grid.counts).toEqual([[2], [3], [0], [4]]);
	});

	it('sizes buckets in whole units', () => {
		const start = new Date(0);
		expect(bucketFor(start, new Date(3600_000), 12, 300)).toBe(300);
		expect(bucketFor(start, new Date(7 * 86_400_000), 12, 300)).toBe(50_400);
	});
});

describe('nodes', () => {
	const pod = (name: string, node?: string) =>
		({
			name,
			namespace: 'n',
			node,
			status: { key: 'running', tone: 'ok' },
			argv: [],
			hami: []
		}) as PodInfo;

	it('tags nodes by name and groups pods by node', () => {
		const pods = [pod('c', 'node-b'), pod('a', 'node-b'), pod('b', 'node-a'), pod('d')];
		const tags = nodeTags(pods, ['x', 'y']);
		expect(tags.get('node-a')).toEqual({ label: '1', color: 'x' });
		expect(tags.get('node-b')).toEqual({ label: '2', color: 'y' });
		expect(byNode(pods).map((p) => p.name)).toEqual(['b', 'a', 'c', 'd']);
	});
});

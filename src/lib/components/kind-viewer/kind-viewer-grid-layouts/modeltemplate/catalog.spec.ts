import { describe, expect, it } from 'vitest';

import type { NodeInfo } from '$lib/components/gpu-allocation/types';

import {
	clusterGpuTypesFor,
	coerceSelection,
	composeTemplate,
	defaultSelection,
	describeEntry,
	extractVariant,
	fitsOnOneNode,
	gpuCountOptions,
	gpuTypeOptions,
	groupForEntry,
	isModelEntry,
	kvOffloadOptions,
	type ModelTemplateObject,
	parsePositiveInteger,
	pinClusterGpuType,
	resolveTemplate,
	summarizeGpuTopology,
	type TemplateVariant,
	workloadOptions
} from './catalog';

/** A deployment template as generate_llmisvc_templates.py writes it. */
function generated(options: {
	workload: 'retrieval' | 'document' | 'agent';
	gpus: 1 | 2;
	offload: boolean;
	version?: number;
	provisional?: boolean;
	model?: string;
}): ModelTemplateObject {
	const {
		workload,
		gpus,
		offload,
		version = 1,
		provisional = gpus === 2,
		model = 'qwen3-8-27b'
	} = options;
	const name = `${model}-${workload}-pro6000-${gpus}gpu-${offload ? 'offload' : 'no-offload'}-v${version}`;
	const maxModelLen = { retrieval: 8192, document: 32768, agent: 65536 }[workload];
	return {
		metadata: {
			name,
			namespace: 'otterscale-system',
			labels: {
				'otterscale.io/template-role': 'deployment',
				'otterscale.io/model': model,
				'otterscale.io/workload': workload,
				'otterscale.io/gpu': 'rtx-pro-6000',
				'otterscale.io/gpus-in-total': String(gpus),
				'otterscale.io/kv-offload': String(offload),
				'otterscale.io/template-version': String(version)
			},
			annotations: {
				'otterscale.io/vllm-version': '0.33.0',
				'otterscale.io/max-model-len': String(maxModelLen),
				'otterscale.io/demanded-concurrency': '1',
				'otterscale.io/capacity-per-instance': String(4 * gpus),
				'otterscale.io/instances': '1',
				'otterscale.io/gpus-per-instance': String(gpus),
				'otterscale.io/tensor-parallel-size': String(gpus),
				'otterscale.io/provisional': String(provisional),
				'otterscale.io/latency-conditions': 'single-model-per-node',
				...(provisional
					? {}
					: {
							'otterscale.io/expected-time-to-first-token-milliseconds': '11745',
							'otterscale.io/expected-inter-token-latency-milliseconds': '40.5',
							'otterscale.io/worst-time-to-first-token-milliseconds': '13395',
							'otterscale.io/worst-inter-token-latency-milliseconds': '50.5'
						}),
				...(offload
					? {
							'otterscale.io/gpu-kv-cache-gibibytes': String(32 * gpus),
							'otterscale.io/kv-offload-cpu-gibibytes': String(64 * gpus),
							'otterscale.io/kv-offload-storage-default-gibibytes': String(192 * gpus),
							'otterscale.io/kv-offload-storage-minimum-gibibytes': String(128 * gpus)
						}
					: {})
			}
		},
		spec: {
			template: { containers: [{ name: 'main', image: 'vllm/vllm-openai:v0.33.0' }] }
		}
	};
}

const ALL = (['retrieval', 'document', 'agent'] as const).flatMap((workload) =>
	([1, 2] as const).flatMap((gpus) =>
		[false, true].map((offload) => generated({ workload, gpus, offload }))
	)
);

/** A config written before the label contract. */
const legacy: ModelTemplateObject = {
	metadata: { name: 'meta-llama-llama-3-3-70b-instruct', namespace: 'otterscale-system' },
	spec: {
		model: {
			name: 'meta-llama/Llama-3.3-70B-Instruct',
			uri: 'hf://meta-llama/Llama-3.3-70B-Instruct'
		},
		template: { containers: [{ name: 'main', image: 'vllm/vllm-openai:v0.33.0' }] }
	}
};

/** A model entry: the model and its description, nothing about running it. */
const qwenEntry: ModelTemplateObject = {
	metadata: {
		name: 'qwen3-8-27b',
		namespace: 'otterscale-system',
		labels: { 'otterscale.io/template-role': 'model', 'otterscale.io/model': 'qwen3-8-27b' },
		annotations: {
			'otterscale.io/model-name': 'Qwen3.8 27B',
			'otterscale.io/vendor': 'Alibaba',
			'otterscale.io/description': 'Hybrid-architecture 27B model for agents and documents.'
		}
	},
	spec: { model: { uri: 'pvc://qwen-models/Qwen3.8-27B', name: 'qwen3-8-27b' } }
};

function variantOf(object: ModelTemplateObject): TemplateVariant {
	const result = extractVariant(object);
	if (!('variant' in result)) throw new Error(`invalid labels: ${result.invalid.join(', ')}`);
	return result.variant;
}

describe('isModelEntry', () => {
	it('recognises a config by its role label', () => {
		expect(isModelEntry(qwenEntry)).toBe(true);
		expect(isModelEntry(generated({ workload: 'agent', gpus: 1, offload: false }))).toBe(false);
		expect(isModelEntry(legacy)).toBe(false);
		expect(isModelEntry({ metadata: { name: 'empty' }, spec: {} })).toBe(false);
	});
});

describe('parsePositiveInteger', () => {
	it('accepts whole positive numbers only', () => {
		expect(parsePositiveInteger('2')).toBe(2);
		expect(parsePositiveInteger(undefined)).toBeNull();
		expect(parsePositiveInteger('0')).toBeNull();
		expect(parsePositiveInteger('0.5')).toBeNull();
		expect(parsePositiveInteger('24Gi')).toBeNull();
	});
});

describe('extractVariant', () => {
	it('reads every matching fact from the labels', () => {
		const variant = variantOf(generated({ workload: 'agent', gpus: 2, offload: true }));
		expect(variant.workload).toBe('agent');
		expect(variant.gpuType).toBe('rtx-pro-6000');
		expect(variant.gpuCount).toBe(2);
		expect(variant.kvOffload).toBe(true);
		expect(variant.middleware).toBe(false);
		expect(variant.version).toBe(1);
	});

	it('reads the display facts from the annotations', () => {
		const { details } = variantOf(generated({ workload: 'agent', gpus: 1, offload: true }));
		expect(details.maxModelLen).toBe(65536);
		expect(details.capacityPerInstance).toBe(4);
		expect(details.instances).toBe(1);
		expect(details.provisional).toBe(false);
		expect(details.expectedTimeToFirstTokenMs).toBe(11745);
		expect(details.worstInterTokenLatencyMs).toBe(50.5);
		expect(details.kvOffloadCpuGiB).toBe(64);
		expect(details.kvOffloadStorageDefaultGiB).toBe(192);
		expect(details.kvOffloadStorageMinimumGiB).toBe(128);
		expect(details.kvOffloadStorageMaximumGiB).toBeNull();
	});

	it('marks provisional templates and leaves missing latency null', () => {
		const { details } = variantOf(generated({ workload: 'agent', gpus: 2, offload: false }));
		expect(details.provisional).toBe(true);
		expect(details.expectedTimeToFirstTokenMs).toBeNull();
	});

	it('lists every required label a template lacks instead of guessing from the spec', () => {
		expect(extractVariant(legacy)).toEqual({
			invalid: [
				'otterscale.io/workload',
				'otterscale.io/gpu',
				'otterscale.io/gpus-in-total',
				'otterscale.io/kv-offload',
				'otterscale.io/template-version'
			]
		});
	});

	it('treats an unparsable label as invalid', () => {
		const template = generated({ workload: 'agent', gpus: 1, offload: false });
		template.metadata!.labels!['otterscale.io/gpus-in-total'] = 'two';
		template.metadata!.labels!['otterscale.io/kv-offload'] = 'maybe';
		expect(extractVariant(template)).toEqual({
			invalid: ['otterscale.io/gpus-in-total', 'otterscale.io/kv-offload']
		});
	});

	it('detects the legacy middleware image', () => {
		const template = generated({ workload: 'agent', gpus: 1, offload: true });
		template.spec!.template = { containers: [{ name: 'main', image: 'r/ai-mw/kv:1' }] };
		expect(variantOf(template).middleware).toBe(true);
	});
});

describe('describeEntry', () => {
	it('prefers the display name, then the model name, then the object name', () => {
		expect(describeEntry(qwenEntry)).toEqual({
			name: 'qwen3-8-27b',
			namespace: 'otterscale-system',
			modelName: 'Qwen3.8 27B',
			vendor: 'Alibaba',
			modelUri: 'pvc://qwen-models/Qwen3.8-27B',
			description: 'Hybrid-architecture 27B model for agents and documents.'
		});
		expect(
			describeEntry({
				metadata: { name: 'bare' },
				spec: { model: { name: ' llama ', uri: '' } }
			})
		).toEqual({
			name: 'bare',
			namespace: '',
			modelName: 'llama',
			vendor: null,
			modelUri: null,
			description: null
		});
		expect(describeEntry({ metadata: { name: 'bare' }, spec: {} }).modelName).toBe('bare');
	});
});

describe('groupForEntry', () => {
	it('describes the group by its entry and attaches the listed templates', () => {
		const group = groupForEntry(qwenEntry, ALL);
		expect(group.entry.name).toBe('qwen3-8-27b');
		expect(group.modelName).toBe('Qwen3.8 27B');
		expect(group.modelUri).toBe('pvc://qwen-models/Qwen3.8-27B');
		expect(group.description).toContain('27B model');
		expect(group.variants).toHaveLength(12);
		expect(group.skipped).toEqual([]);
	});

	it('orders variants by workload, GPU count, then KV offload', () => {
		const { variants } = groupForEntry(qwenEntry, [...ALL].reverse());
		expect(variants.slice(0, 4).map((variant) => variant.name)).toEqual([
			'qwen3-8-27b-retrieval-pro6000-1gpu-no-offload-v1',
			'qwen3-8-27b-retrieval-pro6000-1gpu-offload-v1',
			'qwen3-8-27b-retrieval-pro6000-2gpu-no-offload-v1',
			'qwen3-8-27b-retrieval-pro6000-2gpu-offload-v1'
		]);
		expect(variants.at(-1)?.workload).toBe('agent');
	});

	it('skips a template with incomplete labels and reports it', () => {
		const group = groupForEntry(qwenEntry, [
			legacy,
			generated({ workload: 'agent', gpus: 1, offload: false })
		]);
		expect(group.variants).toHaveLength(1);
		expect(group.skipped).toEqual([{ name: legacy.metadata!.name, labels: expect.any(Array) }]);
	});

	it('keeps an entry without templates, with no variants', () => {
		const group = groupForEntry(qwenEntry, []);
		expect(group.entry.name).toBe('qwen3-8-27b');
		expect(group.variants).toEqual([]);
		expect(defaultSelection(group)).toEqual({
			workload: '',
			gpuType: '',
			gpuCount: 0,
			kvOffload: false
		});
	});
});

describe('options and resolution', () => {
	const group = groupForEntry(qwenEntry, ALL);

	it('derives each level from the templates above it', () => {
		expect(workloadOptions(group)).toEqual(['retrieval', 'document', 'agent']);
		expect(gpuTypeOptions(group, 'agent')).toEqual(['rtx-pro-6000']);
		expect(gpuCountOptions(group, 'agent', 'rtx-pro-6000')).toEqual([1, 2]);
		expect(kvOffloadOptions(group, 'agent', 'rtx-pro-6000', 2)).toEqual({ on: true, off: true });
	});

	it('defaults to the first workload, GPU and smallest count without offload', () => {
		expect(defaultSelection(group)).toEqual({
			workload: 'retrieval',
			gpuType: 'rtx-pro-6000',
			gpuCount: 1,
			kvOffload: false
		});
	});

	it('resolves a full selection to exactly one template', () => {
		const resolution = resolveTemplate(group, {
			workload: 'document',
			gpuType: 'rtx-pro-6000',
			gpuCount: 2,
			kvOffload: true
		});
		expect(resolution.kind).toBe('match');
		if (resolution.kind === 'match') {
			expect(resolution.variant.name).toBe('qwen3-8-27b-document-pro6000-2gpu-offload-v1');
			expect(resolution.alternatives).toEqual([]);
		}
	});

	it('names the first unmet field when nothing matches', () => {
		expect(
			resolveTemplate(group, { workload: 'agent', gpuType: 'b300', gpuCount: 1, kvOffload: false })
		).toEqual({ kind: 'none', unmet: ['gpuType'] });
		expect(
			resolveTemplate(group, {
				workload: 'agent',
				gpuType: 'rtx-pro-6000',
				gpuCount: 4,
				kvOffload: false
			})
		).toEqual({ kind: 'none', unmet: ['gpuCount'] });
	});

	it('coerces dependent fields when a parent choice changes', () => {
		const partial = groupForEntry(qwenEntry, [
			generated({ workload: 'agent', gpus: 1, offload: false }),
			generated({ workload: 'agent', gpus: 2, offload: true })
		]);
		expect(
			coerceSelection(partial, {
				workload: 'agent',
				gpuType: 'rtx-pro-6000',
				gpuCount: 2,
				kvOffload: false
			})
		).toEqual({ workload: 'agent', gpuType: 'rtx-pro-6000', gpuCount: 2, kvOffload: true });
		expect(
			coerceSelection(partial, {
				workload: 'retrieval',
				gpuType: 'b300',
				gpuCount: 8,
				kvOffload: true
			})
		).toEqual({ workload: 'agent', gpuType: 'rtx-pro-6000', gpuCount: 1, kvOffload: false });
	});

	it('prefers the newest version and keeps the older as an alternative', () => {
		const versioned = groupForEntry(qwenEntry, [
			generated({ workload: 'agent', gpus: 1, offload: false, version: 1 }),
			generated({ workload: 'agent', gpus: 1, offload: false, version: 2 })
		]);
		const resolution = resolveTemplate(versioned, defaultSelection(versioned));
		expect(resolution.kind).toBe('match');
		if (resolution.kind === 'match') {
			expect(resolution.variant.version).toBe(2);
			expect(resolution.alternatives.map((variant) => variant.version)).toEqual([1]);
		}
	});

	it('reports equal versions as a tie', () => {
		const twin = generated({ workload: 'agent', gpus: 1, offload: false });
		const tied = groupForEntry(qwenEntry, [
			twin,
			{ ...twin, metadata: { ...twin.metadata, name: 'twin' } }
		]);
		const resolution = resolveTemplate(tied, defaultSelection(tied));
		expect(resolution.kind).toBe('ambiguous');
	});
});

describe('composeTemplate', () => {
	it('fills the model from the entry without touching the listed template', () => {
		const group = groupForEntry(qwenEntry, [
			generated({ workload: 'agent', gpus: 1, offload: false })
		]);
		const composed = composeTemplate(group, group.variants[0]);
		expect(composed.spec?.model).toEqual({
			uri: 'pvc://qwen-models/Qwen3.8-27B',
			name: 'qwen3-8-27b'
		});
		expect(group.variants[0].object.spec?.model).toBeUndefined();
	});

	it('accepts a proxied group, as Svelte state hands it over', () => {
		const group = groupForEntry(qwenEntry, [
			generated({ workload: 'agent', gpus: 1, offload: false })
		]);
		const proxied = new Proxy(group.variants[0], {});
		expect(composeTemplate(group, proxied).spec?.model?.name).toBe('qwen3-8-27b');
		const deep = { ...group.variants[0], object: new Proxy(group.variants[0].object, {}) };
		expect(composeTemplate(group, deep).spec?.model?.name).toBe('qwen3-8-27b');
	});

	it('keeps a model field the template sets itself', () => {
		const template = generated({ workload: 'agent', gpus: 1, offload: false });
		template.spec!.model = { uri: 'hf://Qwen/Qwen3.8-27B' };
		const group = groupForEntry(qwenEntry, [template]);
		expect(composeTemplate(group, group.variants[0]).spec?.model).toEqual({
			uri: 'hf://Qwen/Qwen3.8-27B',
			name: 'qwen3-8-27b'
		});
	});
});

describe('cluster GPU topology', () => {
	const device = (type: string, overrides: Partial<NodeInfo['devices'][number]> = {}) => ({
		id: 'GPU',
		index: 0,
		count: 10,
		devcore: 100,
		devmem: 97871,
		type,
		mode: '',
		health: true,
		...overrides
	});
	const PRO6000 = 'NVIDIA RTX PRO 6000 Blackwell Server Edition';
	const nodes: NodeInfo[] = [
		{ name: 'a', devices: [device(PRO6000), device(PRO6000), device(PRO6000, { health: false })] },
		{
			name: 'b',
			devices: [device(PRO6000), device('NVIDIA L40S', { mode: 'mig' }), device('NVIDIA L40S')]
		}
	];

	it('counts healthy whole cards per type and node', () => {
		const [l40s, pro6000] = summarizeGpuTopology(nodes);
		expect(pro6000).toEqual({
			type: PRO6000,
			nodeCount: 2,
			maxPerNode: 2,
			totalCards: 3,
			memoryMiB: 97871
		});
		expect(l40s.totalCards).toBe(1);
		expect(fitsOnOneNode(pro6000, 2)).toBe(true);
		expect(fitsOnOneNode(pro6000, 4)).toBe(false);
	});

	it('maps a template GPU slug onto the cluster device models', () => {
		const summaries = summarizeGpuTopology(nodes);
		expect(clusterGpuTypesFor('rtx-pro-6000', summaries).map((summary) => summary.type)).toEqual([
			PRO6000
		]);
		expect(clusterGpuTypesFor('b300', summaries)).toEqual([]);
	});
});

describe('pinClusterGpuType', () => {
	const types = ['NVIDIA RTX PRO 6000 Blackwell Server Edition', 'NVIDIA H100 80GB HBM3'];

	it('pins the one cluster model a slug names', () => {
		expect(pinClusterGpuType('rtx-pro-6000', types)).toBe(types[0]);
	});

	it('pins nothing without a slug, a match, or with several matches', () => {
		expect(pinClusterGpuType(undefined, types)).toBeUndefined();
		expect(pinClusterGpuType('a100', types)).toBeUndefined();
		expect(pinClusterGpuType('nvidia', types)).toBeUndefined();
	});
});

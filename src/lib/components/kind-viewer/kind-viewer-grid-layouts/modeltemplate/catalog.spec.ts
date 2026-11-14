import { describe, expect, it } from 'vitest';

import {
	buildTemplateDict,
	coerceSelection,
	defaultSelection,
	describeEntry,
	gpuAmountLabel,
	gpuOptions,
	gpuProductLabel,
	gpusOptions,
	kvOffloadOptions,
	type ModelTemplateObject,
	parseGpuAmount,
	pickTemplate,
	replicasOptions,
	routingOptions,
	templateResources,
	workloadOptions
} from './catalog';

function generated(options: {
	workload: 'retrieval' | 'document' | 'agent';
	gpus?: string;
	replicas?: number;
	offload: boolean;
	routing?: boolean;
}): ModelTemplateObject {
	const { workload, gpus = '1', replicas = 1, offload, routing = false } = options;
	const name = `qwen3-8-27b-${workload}-pro6000-${gpus}gpu-${replicas}x-${offload ? 'offload' : 'no-offload'}${routing ? '-routing' : ''}`;
	const maxModelLen = { retrieval: 8192, document: 32768, agent: 65536 }[workload];
	return {
		metadata: {
			name,
			namespace: 'otterscale-system',
			labels: {
				'template.otterscale.io/template-role': 'deployment',
				'template.otterscale.io/model': 'qwen3-8-27b',
				'template.otterscale.io/workload': workload,
				'template.otterscale.io/gpu-type': 'NVIDIA-RTX-PRO-6000-Blackwell-Server-Edition',
				'template.otterscale.io/gpus-per-replica': gpus,
				'template.otterscale.io/replicas': String(replicas),
				'template.otterscale.io/kv-cache-offload': String(offload),
				'template.otterscale.io/precise-prefix-cache-routing': String(routing),
				'template.otterscale.io/vendor': 'Qwen'
			},
			annotations: {
				'template.otterscale.io/gpu-type': 'NVIDIA RTX PRO 6000 Blackwell Server Edition',
				'template.otterscale.io/vllm-version': '0.33.0',
				'template.otterscale.io/max-model-len': String(maxModelLen),
				'template.otterscale.io/concurrency': '11',
				'template.otterscale.io/gpu-usage': '2 x 1/2 GPU, 95.6 GiB VRAM',
				'template.otterscale.io/tensor-parallel-size': '1',
				'template.otterscale.io/provisional': 'true',
				...(offload
					? {
							'template.otterscale.io/gpu-kv-cache-gibibytes': '11',
							'template.otterscale.io/kv-offload-cpu-gibibytes': '22',
							'template.otterscale.io/kv-offload-storage-default-gibibytes': '44',
							'template.otterscale.io/kv-offload-storage-minimum-gibibytes': '44'
						}
					: {})
			}
		},
		spec: { replicas }
	};
}

const GPU = 'NVIDIA-RTX-PRO-6000-Blackwell-Server-Edition';

const ALL = (['retrieval', 'document', 'agent'] as const).flatMap((workload) =>
	(['1', '2'] as const).flatMap((gpus) =>
		[false, true].map((offload) => generated({ workload, gpus, offload }))
	)
);

const entry: ModelTemplateObject = {
	metadata: {
		name: 'qwen3-8-27b',
		namespace: 'otterscale-system',
		labels: {
			'template.otterscale.io/template-role': 'model',
			'template.otterscale.io/model': 'qwen3-8-27b'
		},
		annotations: {
			'template.otterscale.io/model-name': 'Qwen3.8 27B',
			'template.otterscale.io/vendor': 'Alibaba',
			'template.otterscale.io/description': 'Hybrid-architecture 27B model.'
		}
	},
	spec: { model: { uri: 'pvc://qwen-models/Qwen3.8-27B', name: 'qwen3-8-27b' } }
};

describe('buildTemplateDict', () => {
	it('indexes templates by workload, gpu, count, replicas, offload and routing', () => {
		const dict = buildTemplateDict(ALL);
		expect(workloadOptions(dict)).toEqual(['retrieval', 'document', 'agent']);
		expect(gpuOptions(dict, 'agent')).toEqual([GPU]);
		expect(gpusOptions(dict, 'agent', GPU)).toEqual(['1', '2']);
		expect(replicasOptions(dict, 'agent', GPU, '2')).toEqual(['1']);
		expect(kvOffloadOptions(dict, 'agent', GPU, '2', '1')).toEqual(['false', 'true']);
		expect(routingOptions(dict, 'agent', GPU, '2', '1', 'false')).toEqual(['false']);
		const template = pickTemplate(dict, {
			workload: 'document',
			gpu: GPU,
			gpus: '2',
			replicas: '1',
			kvOffload: 'true',
			routing: 'false'
		});
		expect(template?.name).toBe('qwen3-8-27b-document-pro6000-2gpu-1x-offload');
		expect(template?.details.maxModelLen).toBe(32768);
		expect(template?.details.concurrency).toBe(11);
		expect(template?.details.vllmVersion).toBe('0.33.0');
		expect(template?.details.kvOffloadCpuGibibytes).toBe(22);
	});

	it('separates routing variants of the same shape', () => {
		const dict = buildTemplateDict([
			generated({ workload: 'retrieval', gpus: 'one-half', replicas: 2, offload: true }),
			generated({
				workload: 'retrieval',
				gpus: 'one-half',
				replicas: 2,
				offload: true,
				routing: true
			})
		]);
		expect(routingOptions(dict, 'retrieval', GPU, 'one-half', '2', 'true')).toEqual([
			'false',
			'true'
		]);
		const routed = pickTemplate(dict, {
			workload: 'retrieval',
			gpu: GPU,
			gpus: 'one-half',
			replicas: '2',
			kvOffload: 'true',
			routing: 'true'
		});
		expect(routed?.name).toContain('-routing');
	});

	it('skips a template missing one of the labels', () => {
		const incomplete = generated({ workload: 'agent', offload: false });
		delete incomplete.metadata!.labels!['template.otterscale.io/kv-cache-offload'];
		const dict = buildTemplateDict([incomplete]);
		expect(workloadOptions(dict)).toEqual([]);
	});

	it('defaults a missing routing label to false', () => {
		const object = generated({ workload: 'agent', offload: false });
		delete object.metadata!.labels!['template.otterscale.io/precise-prefix-cache-routing'];
		const dict = buildTemplateDict([object]);
		expect(routingOptions(dict, 'agent', GPU, '1', '1', 'false')).toEqual(['false']);
	});

	it('sorts GPU shares numerically, word fractions included', () => {
		const templates = ['2', 'one-half', '1', 'one-quarter', '1of3', '10'].map((gpus) => {
			const object = generated({ workload: 'agent', offload: false });
			object.metadata!.name = `fraction-${gpus}`;
			object.metadata!.labels!['template.otterscale.io/gpus-per-replica'] = gpus;
			return object;
		});
		const dict = buildTemplateDict(templates);
		expect(gpusOptions(dict, 'agent', GPU)).toEqual([
			'one-quarter',
			'1of3',
			'one-half',
			'1',
			'2',
			'10'
		]);
	});

	it('sorts replica counts numerically', () => {
		const dict = buildTemplateDict([
			generated({ workload: 'retrieval', gpus: 'one-half', replicas: 10, offload: false }),
			generated({ workload: 'retrieval', gpus: 'one-half', replicas: 2, offload: false })
		]);
		expect(replicasOptions(dict, 'retrieval', GPU, 'one-half')).toEqual(['2', '10']);
	});
});

describe('selection', () => {
	const dict = buildTemplateDict(ALL);

	it('defaults to the first workload and smallest count without offload or routing', () => {
		expect(defaultSelection(dict)).toEqual({
			workload: 'retrieval',
			gpu: GPU,
			gpus: '1',
			replicas: '1',
			kvOffload: 'false',
			routing: 'false'
		});
	});

	it('coerces dependent fields when a parent choice changes', () => {
		const partial = buildTemplateDict([
			generated({ workload: 'agent', gpus: '1', offload: false }),
			generated({ workload: 'agent', gpus: '2', offload: true })
		]);
		expect(
			coerceSelection(partial, {
				workload: 'agent',
				gpu: GPU,
				gpus: '2',
				replicas: '1',
				kvOffload: 'false',
				routing: 'false'
			})
		).toEqual({
			workload: 'agent',
			gpu: GPU,
			gpus: '2',
			replicas: '1',
			kvOffload: 'true',
			routing: 'false'
		});
		expect(
			coerceSelection(partial, {
				workload: 'retrieval',
				gpu: 'b300',
				gpus: '8',
				replicas: '4',
				kvOffload: 'true',
				routing: 'true'
			})
		).toEqual({
			workload: 'agent',
			gpu: GPU,
			gpus: '1',
			replicas: '1',
			kvOffload: 'false',
			routing: 'false'
		});
	});

	it('returns empty fields for an empty dict', () => {
		expect(defaultSelection({})).toEqual({
			workload: '',
			gpu: '',
			gpus: '',
			replicas: '',
			kvOffload: '',
			routing: ''
		});
	});
});

describe('describeEntry', () => {
	it('prefers the display name, then the model name, then the object name', () => {
		expect(describeEntry(entry)).toEqual({
			name: 'qwen3-8-27b',
			namespace: 'otterscale-system',
			modelName: 'Qwen3.8 27B',
			vendor: 'Alibaba',
			modelUri: 'pvc://qwen-models/Qwen3.8-27B',
			description: 'Hybrid-architecture 27B model.'
		});
		expect(describeEntry({ metadata: { name: 'bare' }, spec: {} }).modelName).toBe('bare');
	});
});

describe('templateResources', () => {
	it('reads the main container and splits the gpu-usage annotation', () => {
		expect(
			templateResources({
				metadata: {
					annotations: {
						'template.otterscale.io/gpu-usage': '2 GPUs, 191.2 GiB VRAM'
					}
				},
				spec: {
					template: {
						containers: [
							{ name: 'sidecar', resources: { requests: { cpu: '1' } } },
							{
								name: 'main',
								resources: {
									requests: { cpu: '8', memory: '64Gi' },
									limits: { cpu: '16' }
								}
							}
						]
					}
				}
			})
		).toEqual({ cpu: '8', memory: '64Gi', gpu: '2 GPUs', vram: '191.2 GiB' });
	});

	it('keeps an unsplittable gpu-usage as the GPU share and handles missing values', () => {
		expect(
			templateResources({
				metadata: { annotations: { 'template.otterscale.io/gpu-usage': '1 GPU' } },
				spec: {}
			})
		).toEqual({ cpu: null, memory: null, gpu: '1 GPU', vram: null });
		expect(templateResources({ spec: {} })).toEqual({
			cpu: null,
			memory: null,
			gpu: null,
			vram: null
		});
	});
});

describe('GPU amounts', () => {
	it('parses whole, fractional and word values', () => {
		expect(parseGpuAmount('2')).toEqual({ numerator: 2, denominator: 1 });
		expect(parseGpuAmount('1of3')).toEqual({ numerator: 1, denominator: 3 });
		expect(parseGpuAmount('1/3')).toEqual({ numerator: 1, denominator: 3 });
		expect(parseGpuAmount('one-half')).toEqual({ numerator: 1, denominator: 2 });
		expect(parseGpuAmount('one-quarter')).toEqual({ numerator: 1, denominator: 4 });
		expect(parseGpuAmount('0of3')).toBeNull();
		expect(parseGpuAmount('half')).toBeNull();
		expect(parseGpuAmount(undefined)).toBeNull();
	});

	it('shows the gpu-type annotation for the GPU type, falling back to the label', () => {
		const dict = buildTemplateDict(ALL);
		expect(gpuProductLabel(dict, 'agent', GPU)).toBe(
			'NVIDIA RTX PRO 6000 Blackwell Server Edition'
		);
		const bare = generated({ workload: 'agent', offload: false });
		delete bare.metadata!.annotations!['template.otterscale.io/gpu-type'];
		expect(gpuProductLabel(buildTemplateDict([bare]), 'agent', GPU)).toBe(GPU);
	});

	it('labels fractions with a slash', () => {
		expect(gpuAmountLabel('one-half')).toBe('1/2');
		expect(gpuAmountLabel('one-quarter')).toBe('1/4');
		expect(gpuAmountLabel('1of3')).toBe('1/3');
		expect(gpuAmountLabel('2')).toBe('2');
		expect(gpuAmountLabel('0.5')).toBe('0.5');
	});
});

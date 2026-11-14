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
	templateResources,
	workloadOptions
} from './catalog';

function generated(options: {
	workload: 'retrieval' | 'document' | 'agent';
	gpus: 1 | 2;
	offload: boolean;
	version?: number;
}): ModelTemplateObject {
	const { workload, gpus, offload, version = 1 } = options;
	const name = `qwen3-8-27b-${workload}-pro6000-${gpus}gpu-${offload ? 'offload' : 'no-offload'}-v${version}`;
	const maxModelLen = { retrieval: 8192, document: 32768, agent: 65536 }[workload];
	return {
		metadata: {
			name,
			namespace: 'otterscale-system',
			labels: {
				'otterscale.io/template-role': 'deployment',
				'otterscale.io/model': 'qwen3-8-27b',
				'otterscale.io/workload': workload,
				'otterscale.io/gpu': 'rtx-pro-6000',
				'otterscale.io/gpus-in-total': String(gpus),
				'otterscale.io/kv-offload': String(offload),
				'otterscale.io/template-version': String(version)
			},
			annotations: {
				'otterscale.io/max-model-len': String(maxModelLen),
				'otterscale.io/capacity-per-instance': String(4 * gpus),
				'otterscale.io/instances': '1',
				'otterscale.io/provisional': 'false',
				'otterscale.io/expected-time-to-first-token-milliseconds': '11745',
				'otterscale.io/expected-inter-token-latency-milliseconds': '40.5',
				'otterscale.io/worst-time-to-first-token-milliseconds': '13395',
				'otterscale.io/worst-inter-token-latency-milliseconds': '50.5'
			}
		},
		spec: {}
	};
}

const ALL = (['retrieval', 'document', 'agent'] as const).flatMap((workload) =>
	([1, 2] as const).flatMap((gpus) =>
		[false, true].map((offload) => generated({ workload, gpus, offload }))
	)
);

const entry: ModelTemplateObject = {
	metadata: {
		name: 'qwen3-8-27b',
		namespace: 'otterscale-system',
		labels: { 'otterscale.io/template-role': 'model', 'otterscale.io/model': 'qwen3-8-27b' },
		annotations: {
			'otterscale.io/model-name': 'Qwen3.8 27B',
			'otterscale.io/vendor': 'Alibaba',
			'otterscale.io/description': 'Hybrid-architecture 27B model.'
		}
	},
	spec: { model: { uri: 'pvc://qwen-models/Qwen3.8-27B', name: 'qwen3-8-27b' } }
};

describe('buildTemplateDict', () => {
	it('indexes templates by workload, gpu, count and offload', () => {
		const dict = buildTemplateDict(ALL);
		expect(workloadOptions(dict)).toEqual(['retrieval', 'document', 'agent']);
		expect(gpuOptions(dict, 'agent')).toEqual(['rtx-pro-6000']);
		expect(gpusOptions(dict, 'agent', 'rtx-pro-6000')).toEqual(['1', '2']);
		expect(kvOffloadOptions(dict, 'agent', 'rtx-pro-6000', '2')).toEqual(['false', 'true']);
		const template = pickTemplate(dict, {
			workload: 'document',
			gpu: 'rtx-pro-6000',
			gpus: '2',
			kvOffload: 'true'
		});
		expect(template?.name).toBe('qwen3-8-27b-document-pro6000-2gpu-offload-v1');
		expect(template?.details.maxModelLen).toBe(32768);
		expect(template?.details.expectedInterTokenLatencyMs).toBe(40.5);
	});

	it('skips a template missing one of the labels', () => {
		const incomplete = generated({ workload: 'agent', gpus: 1, offload: false });
		delete incomplete.metadata!.labels!['otterscale.io/kv-offload'];
		const dict = buildTemplateDict([incomplete]);
		expect(workloadOptions(dict)).toEqual([]);
	});

	it('sorts GPU counts numerically, vGPU fractions included', () => {
		const templates = ['2', '1of2', '1', '1of6', '1of3', '10', '0.5'].map((gpus) => {
			const object = generated({ workload: 'agent', gpus: 1, offload: false });
			object.metadata!.name = `fraction-${gpus}`;
			object.metadata!.labels!['otterscale.io/gpus-in-total'] = gpus;
			return object;
		});
		const dict = buildTemplateDict(templates);
		expect(gpusOptions(dict, 'agent', 'rtx-pro-6000')).toEqual([
			'1of6',
			'1of3',
			'0.5',
			'1of2',
			'1',
			'2',
			'10'
		]);
	});

	it('puts the newest version first', () => {
		const dict = buildTemplateDict([
			generated({ workload: 'agent', gpus: 1, offload: false, version: 1 }),
			generated({ workload: 'agent', gpus: 1, offload: false, version: 2 })
		]);
		const template = pickTemplate(dict, {
			workload: 'agent',
			gpu: 'rtx-pro-6000',
			gpus: '1',
			kvOffload: 'false'
		});
		expect(template?.version).toBe(2);
	});
});

describe('selection', () => {
	const dict = buildTemplateDict(ALL);

	it('defaults to the first workload and smallest count without offload', () => {
		expect(defaultSelection(dict)).toEqual({
			workload: 'retrieval',
			gpu: 'rtx-pro-6000',
			gpus: '1',
			kvOffload: 'false'
		});
	});

	it('coerces dependent fields when a parent choice changes', () => {
		const partial = buildTemplateDict([
			generated({ workload: 'agent', gpus: 1, offload: false }),
			generated({ workload: 'agent', gpus: 2, offload: true })
		]);
		expect(
			coerceSelection(partial, {
				workload: 'agent',
				gpu: 'rtx-pro-6000',
				gpus: '2',
				kvOffload: 'false'
			})
		).toEqual({ workload: 'agent', gpu: 'rtx-pro-6000', gpus: '2', kvOffload: 'true' });
		expect(
			coerceSelection(partial, { workload: 'retrieval', gpu: 'b300', gpus: '8', kvOffload: 'true' })
		).toEqual({ workload: 'agent', gpu: 'rtx-pro-6000', gpus: '1', kvOffload: 'false' });
	});

	it('returns empty fields for an empty dict', () => {
		expect(defaultSelection({})).toEqual({ workload: '', gpu: '', gpus: '', kvOffload: '' });
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
	it('reads the main container, preferring requests over limits', () => {
		expect(
			templateResources({
				metadata: {
					annotations: {
						'otterscale.io/gpu-memory-per-instance-mebibytes': '97871',
						'otterscale.io/gpu-memory-in-total-mebibytes': '195742'
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
		).toEqual({ cpu: '8', memory: '64Gi', vram: '191.2 Gi' });
	});

	it('formats whole and sub-GiB VRAM and handles missing values', () => {
		const withVram = (total: string): ModelTemplateObject => ({
			metadata: {
				annotations: { 'otterscale.io/gpu-memory-in-total-mebibytes': total }
			},
			spec: {}
		});
		expect(templateResources(withVram('2048')).vram).toBe('2 Gi');
		expect(templateResources(withVram('512')).vram).toBe('512 Mi');
		expect(templateResources({ spec: {} })).toEqual({ cpu: null, memory: null, vram: null });
	});
});

describe('GPU amounts', () => {
	it('parses whole and fractional values', () => {
		expect(parseGpuAmount('2')).toEqual({ numerator: 2, denominator: 1 });
		expect(parseGpuAmount('1of3')).toEqual({ numerator: 1, denominator: 3 });
		expect(parseGpuAmount('1/3')).toEqual({ numerator: 1, denominator: 3 });
		expect(parseGpuAmount('0of3')).toBeNull();
		expect(parseGpuAmount('half')).toBeNull();
		expect(parseGpuAmount(undefined)).toBeNull();
	});

	it('shows the gpu-product annotation for the GPU type, falling back to the label', () => {
		const object = generated({ workload: 'agent', gpus: 1, offload: false });
		object.metadata!.annotations!['otterscale.io/gpu-product'] = 'NVIDIA RTX PRO 6000';
		const dict = buildTemplateDict([object]);
		expect(gpuProductLabel(dict, 'agent', 'rtx-pro-6000')).toBe('NVIDIA RTX PRO 6000');
		expect(gpuProductLabel(buildTemplateDict(ALL), 'agent', 'rtx-pro-6000')).toBe('rtx-pro-6000');
	});

	it('labels fractions with a slash', () => {
		expect(gpuAmountLabel('1of3')).toBe('1/3');
		expect(gpuAmountLabel('1/3')).toBe('1/3');
		expect(gpuAmountLabel('2')).toBe('2');
		expect(gpuAmountLabel('0.5')).toBe('0.5');
	});
});

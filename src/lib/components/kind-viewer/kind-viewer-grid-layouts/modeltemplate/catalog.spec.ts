import { describe, expect, it } from 'vitest';

import type { NodeInfo } from '$lib/components/gpu-allocation/types';

import {
	buildTemplateDict,
	clusterGpuTypes,
	coerceSelection,
	defaultSelection,
	describeEntry,
	gpuOptions,
	gpusOptions,
	kvOffloadOptions,
	type ModelTemplateObject,
	pickTemplate,
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

describe('cluster GPU types', () => {
	const device = (type: string) => ({
		id: 'GPU',
		index: 0,
		count: 10,
		devcore: 100,
		devmem: 97871,
		type,
		mode: '',
		health: true
	});
	const PRO6000 = 'NVIDIA RTX PRO 6000 Blackwell Server Edition';
	const nodes: NodeInfo[] = [
		{ name: 'a', devices: [device(PRO6000), device(PRO6000)] },
		{ name: 'b', devices: [device(PRO6000), device('NVIDIA L40S')] }
	];

	it('lists the distinct device models in the cluster', () => {
		expect(clusterGpuTypes(nodes)).toEqual(['NVIDIA L40S', PRO6000]);
	});
});

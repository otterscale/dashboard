import type { NodeInfo } from '$lib/components/gpu-allocation/types';

export type ModelTemplateObject = {
	metadata?: {
		name?: string;
		namespace?: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	spec?: {
		model?: { name?: string; uri?: string };
	};
};

export interface TemplateDetails {
	maxModelLen: number | null;
	capacityPerInstance: number | null;
	instances: number | null;
	provisional: boolean;
	expectedTimeToFirstTokenMs: number | null;
	expectedInterTokenLatencyMs: number | null;
	worstTimeToFirstTokenMs: number | null;
	worstInterTokenLatencyMs: number | null;
}

export interface ModelTemplate {
	name: string;
	namespace: string;
	object: ModelTemplateObject;
	workload: string;
	gpu: string;
	gpus: string;
	kvOffload: string;
	version: number;
	details: TemplateDetails;
}

export type TemplateDict = Record<
	string,
	Record<string, Record<string, Record<string, ModelTemplate[]>>>
>;

export interface Selection {
	workload: string;
	gpu: string;
	gpus: string;
	kvOffload: string;
}

function annotationNumber(object: ModelTemplateObject, key: string): number | null {
	const raw = object.metadata?.annotations?.[key];
	if (raw === undefined || raw.trim() === '') return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

function readDetails(object: ModelTemplateObject): TemplateDetails {
	return {
		maxModelLen: annotationNumber(object, 'otterscale.io/max-model-len'),
		capacityPerInstance: annotationNumber(object, 'otterscale.io/capacity-per-instance'),
		instances: annotationNumber(object, 'otterscale.io/instances'),
		provisional: object.metadata?.annotations?.['otterscale.io/provisional'] === 'true',
		expectedTimeToFirstTokenMs: annotationNumber(
			object,
			'otterscale.io/expected-time-to-first-token-milliseconds'
		),
		expectedInterTokenLatencyMs: annotationNumber(
			object,
			'otterscale.io/expected-inter-token-latency-milliseconds'
		),
		worstTimeToFirstTokenMs: annotationNumber(
			object,
			'otterscale.io/worst-time-to-first-token-milliseconds'
		),
		worstInterTokenLatencyMs: annotationNumber(
			object,
			'otterscale.io/worst-inter-token-latency-milliseconds'
		)
	};
}

export function buildTemplateDict(templates: ModelTemplateObject[]): TemplateDict {
	const dict: TemplateDict = {};
	for (const object of templates) {
		const labels = object.metadata?.labels ?? {};
		const workload = labels['otterscale.io/workload'];
		const gpu = labels['otterscale.io/gpu'];
		const gpus = labels['otterscale.io/gpus-in-total'];
		const kvOffload = labels['otterscale.io/kv-offload'];
		if (!workload || !gpu || !gpus || !kvOffload) continue;
		const template: ModelTemplate = {
			name: object.metadata?.name ?? '',
			namespace: object.metadata?.namespace ?? '',
			object,
			workload,
			gpu,
			gpus,
			kvOffload,
			version: Number(labels['otterscale.io/template-version']) || 1,
			details: readDetails(object)
		};
		((((dict[workload] ??= {})[gpu] ??= {})[gpus] ??= {})[kvOffload] ??= []).push(template);
	}
	for (const byGpu of Object.values(dict))
		for (const byGpus of Object.values(byGpu))
			for (const byOffload of Object.values(byGpus))
				for (const bucket of Object.values(byOffload))
					bucket.sort((a, b) => b.version - a.version || a.name.localeCompare(b.name));
	return dict;
}

const WORKLOAD_ORDER = ['retrieval', 'document', 'agent'];

const WORKLOAD_INFO: Record<string, { label: string; description: string }> = {
	retrieval: {
		label: 'Retrieval',
		description: 'RAG chat: short prompts over retrieved chunks, many concurrent users.'
	},
	document: {
		label: 'Document',
		description: 'Whole documents in one prompt, a few at a time.'
	},
	agent: {
		label: 'Agent',
		description: 'Long tool-using sessions with a large accumulated context.'
	}
};

export function workloadLabel(workload: string): string {
	return WORKLOAD_INFO[workload]?.label ?? workload.charAt(0).toUpperCase() + workload.slice(1);
}

export function workloadDescription(workload: string): string {
	return WORKLOAD_INFO[workload]?.description ?? '';
}

function compareWorkloads(a: string, b: string): number {
	const indexA = WORKLOAD_ORDER.indexOf(a);
	const indexB = WORKLOAD_ORDER.indexOf(b);
	if (indexA !== -1 || indexB !== -1) {
		if (indexA === -1) return 1;
		if (indexB === -1) return -1;
		return indexA - indexB;
	}
	return a.localeCompare(b);
}

export function workloadOptions(dict: TemplateDict): string[] {
	return Object.keys(dict).sort(compareWorkloads);
}

export function gpuOptions(dict: TemplateDict, workload: string): string[] {
	return Object.keys(dict[workload] ?? {}).sort();
}

export function gpusOptions(dict: TemplateDict, workload: string, gpu: string): string[] {
	return Object.keys(dict[workload]?.[gpu] ?? {}).sort((a, b) => Number(a) - Number(b));
}

export function kvOffloadOptions(
	dict: TemplateDict,
	workload: string,
	gpu: string,
	gpus: string
): string[] {
	return Object.keys(dict[workload]?.[gpu]?.[gpus] ?? {}).sort();
}

export function pickTemplate(dict: TemplateDict, selection: Selection): ModelTemplate | undefined {
	return dict[selection.workload]?.[selection.gpu]?.[selection.gpus]?.[selection.kvOffload]?.[0];
}

export function coerceSelection(dict: TemplateDict, selection: Selection): Selection {
	const workloads = workloadOptions(dict);
	const workload = workloads.includes(selection.workload)
		? selection.workload
		: (workloads[0] ?? '');
	const gpuList = gpuOptions(dict, workload);
	const gpu = gpuList.includes(selection.gpu) ? selection.gpu : (gpuList[0] ?? '');
	const gpusList = gpusOptions(dict, workload, gpu);
	const gpus = gpusList.includes(selection.gpus) ? selection.gpus : (gpusList[0] ?? '');
	const kvList = kvOffloadOptions(dict, workload, gpu, gpus);
	const kvOffload = kvList.includes(selection.kvOffload)
		? selection.kvOffload
		: kvList.includes('false')
			? 'false'
			: (kvList[0] ?? '');
	return { workload, gpu, gpus, kvOffload };
}

export function defaultSelection(dict: TemplateDict): Selection {
	return coerceSelection(dict, { workload: '', gpu: '', gpus: '', kvOffload: 'false' });
}

export interface EntrySummary {
	name: string;
	namespace: string;
	modelName: string;
	vendor: string | null;
	modelUri: string | null;
	description: string | null;
}

export function describeEntry(object: ModelTemplateObject): EntrySummary {
	const name = object.metadata?.name ?? '';
	const annotations = object.metadata?.annotations ?? {};
	return {
		name,
		namespace: object.metadata?.namespace ?? '',
		modelName:
			annotations['otterscale.io/model-name']?.trim() || object.spec?.model?.name?.trim() || name,
		vendor: annotations['otterscale.io/vendor']?.trim() || null,
		modelUri: object.spec?.model?.uri?.trim() || null,
		description: annotations['otterscale.io/description']?.trim() || null
	};
}

export function clusterGpuTypes(nodes: NodeInfo[]): string[] {
	const types: string[] = [];
	for (const node of nodes)
		for (const device of node.devices)
			if (device.type && !types.includes(device.type)) types.push(device.type);
	return types.sort();
}

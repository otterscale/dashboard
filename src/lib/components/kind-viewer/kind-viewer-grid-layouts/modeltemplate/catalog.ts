export type ModelTemplateObject = {
	metadata?: {
		name?: string;
		namespace?: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	spec?: {
		model?: { name?: string; uri?: string };
		replicas?: number;
		template?: {
			containers?: {
				name?: string;
				resources?: {
					requests?: Record<string, string | number>;
					limits?: Record<string, string | number>;
				};
			}[];
		};
	};
};

export interface TemplateDetails {
	maxModelLen: number | null;
	concurrency: number | null;
	provisional: boolean;
	vllmVersion: string | null;
	tensorParallelSize: number | null;
	gpuUsage: string | null;
	gpuKvCacheGibibytes: number | null;
	kvOffloadCpuGibibytes: number | null;
	kvOffloadStorageDefaultGibibytes: number | null;
	kvOffloadStorageMinimumGibibytes: number | null;
}

export interface ModelTemplate {
	name: string;
	namespace: string;
	object: ModelTemplateObject;
	workload: string;
	gpu: string;
	gpus: string;
	replicas: string;
	kvOffload: string;
	routing: string;
	details: TemplateDetails;
}

export type TemplateDict = Record<
	string, // workload
	Record<
		string, // gpu type
		Record<
			string, // gpus per replica
			Record<
				string, // replicas
				Record<
					string, // kv cache offload
					Record<string, ModelTemplate[]> // precise prefix cache routing
				>
			>
		>
	>
>;

export interface Selection {
	workload: string;
	gpu: string;
	gpus: string;
	replicas: string;
	kvOffload: string;
	routing: string;
}

function annotationNumber(object: ModelTemplateObject, key: string): number | null {
	const raw = object.metadata?.annotations?.[key];
	if (raw === undefined || raw.trim() === '') return null;
	const value = Number(raw);
	return Number.isFinite(value) ? value : null;
}

function readDetails(object: ModelTemplateObject): TemplateDetails {
	const annotations = object.metadata?.annotations ?? {};
	return {
		maxModelLen: annotationNumber(object, 'template.otterscale.io/max-model-len'),
		concurrency: annotationNumber(object, 'template.otterscale.io/concurrency'),
		provisional: annotations['template.otterscale.io/provisional'] === 'true',
		vllmVersion: annotations['template.otterscale.io/vllm-version']?.trim() || null,
		tensorParallelSize: annotationNumber(object, 'template.otterscale.io/tensor-parallel-size'),
		gpuUsage: annotations['template.otterscale.io/gpu-usage']?.trim() || null,
		gpuKvCacheGibibytes: annotationNumber(object, 'template.otterscale.io/gpu-kv-cache-gibibytes'),
		kvOffloadCpuGibibytes: annotationNumber(
			object,
			'template.otterscale.io/kv-offload-cpu-gibibytes'
		),
		kvOffloadStorageDefaultGibibytes: annotationNumber(
			object,
			'template.otterscale.io/kv-offload-storage-default-gibibytes'
		),
		kvOffloadStorageMinimumGibibytes: annotationNumber(
			object,
			'template.otterscale.io/kv-offload-storage-minimum-gibibytes'
		)
	};
}

export function buildTemplateDict(templates: ModelTemplateObject[]): TemplateDict {
	const dict: TemplateDict = {};
	for (const object of templates) {
		const labels = object.metadata?.labels ?? {};
		const workload = labels['template.otterscale.io/workload'];
		const gpu = labels['template.otterscale.io/gpu-type'];
		const gpus = labels['template.otterscale.io/gpus-per-replica'];
		const replicas = labels['template.otterscale.io/replicas'];
		const kvOffload = labels['template.otterscale.io/kv-cache-offload'];
		const routing = labels['template.otterscale.io/precise-prefix-cache-routing'] ?? 'false';
		if (!workload || !gpu || !gpus || !replicas || !kvOffload) continue;
		const template: ModelTemplate = {
			name: object.metadata?.name ?? '',
			namespace: object.metadata?.namespace ?? '',
			object,
			workload,
			gpu,
			gpus,
			replicas,
			kvOffload,
			routing,
			details: readDetails(object)
		};
		((((((dict[workload] ??= {})[gpu] ??= {})[gpus] ??= {})[replicas] ??= {})[kvOffload] ??= {})[
			routing
		] ??= []).push(template);
	}
	for (const byGpu of Object.values(dict))
		for (const byGpus of Object.values(byGpu))
			for (const byReplicas of Object.values(byGpus))
				for (const byOffload of Object.values(byReplicas))
					for (const byRouting of Object.values(byOffload))
						for (const bucket of Object.values(byRouting))
							bucket.sort((a, b) => a.name.localeCompare(b.name));
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

const WORD_FRACTIONS: Record<string, { numerator: number; denominator: number }> = {
	'one-half': { numerator: 1, denominator: 2 },
	'one-third': { numerator: 1, denominator: 3 },
	'one-quarter': { numerator: 1, denominator: 4 },
	'one-eighth': { numerator: 1, denominator: 8 },
	'two-thirds': { numerator: 2, denominator: 3 },
	'three-quarters': { numerator: 3, denominator: 4 }
};

export function parseGpuAmount(
	value: string | undefined
): { numerator: number; denominator: number } | null {
	const trimmed = value?.trim();
	if (!trimmed) return null;
	const word = WORD_FRACTIONS[trimmed];
	if (word) return word;
	const match = trimmed.match(/^(\d+)(?:(?:of|\/)(\d+))?$/);
	if (!match) return null;
	const numerator = Number(match[1]);
	const denominator = Number(match[2] ?? 1);
	if (numerator < 1 || denominator < 1) return null;
	return { numerator, denominator };
}

function gpuAmountValue(value: string): number | null {
	const parsed = parseGpuAmount(value);
	if (parsed) return parsed.numerator / parsed.denominator;
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
}

export function gpuAmountLabel(value: string): string {
	const parsed = parseGpuAmount(value);
	if (!parsed) return value;
	return parsed.denominator === 1
		? String(parsed.numerator)
		: `${parsed.numerator}/${parsed.denominator}`;
}

function compareGpuAmounts(a: string, b: string): number {
	const valueA = gpuAmountValue(a);
	const valueB = gpuAmountValue(b);
	if (valueA !== null && valueB !== null) return valueA - valueB || a.localeCompare(b);
	if (valueA !== null) return -1;
	if (valueB !== null) return 1;
	return a.localeCompare(b);
}

export function gpuProductLabel(dict: TemplateDict, workload: string, gpu: string): string {
	for (const byReplicas of Object.values(dict[workload]?.[gpu] ?? {}))
		for (const byOffload of Object.values(byReplicas))
			for (const byRouting of Object.values(byOffload))
				for (const bucket of Object.values(byRouting))
					for (const template of bucket) {
						const product =
							template.object.metadata?.annotations?.['template.otterscale.io/gpu-type']?.trim();
						if (product) return product;
					}
	return gpu;
}

export function gpusOptions(dict: TemplateDict, workload: string, gpu: string): string[] {
	return Object.keys(dict[workload]?.[gpu] ?? {}).sort(compareGpuAmounts);
}

export function replicasOptions(
	dict: TemplateDict,
	workload: string,
	gpu: string,
	gpus: string
): string[] {
	return Object.keys(dict[workload]?.[gpu]?.[gpus] ?? {}).sort(
		(a, b) => Number(a) - Number(b) || a.localeCompare(b)
	);
}

export function kvOffloadOptions(
	dict: TemplateDict,
	workload: string,
	gpu: string,
	gpus: string,
	replicas: string
): string[] {
	return Object.keys(dict[workload]?.[gpu]?.[gpus]?.[replicas] ?? {}).sort();
}

export function routingOptions(
	dict: TemplateDict,
	workload: string,
	gpu: string,
	gpus: string,
	replicas: string,
	kvOffload: string
): string[] {
	return Object.keys(dict[workload]?.[gpu]?.[gpus]?.[replicas]?.[kvOffload] ?? {}).sort();
}

export function pickTemplate(dict: TemplateDict, selection: Selection): ModelTemplate | undefined {
	return dict[selection.workload]?.[selection.gpu]?.[selection.gpus]?.[selection.replicas]?.[
		selection.kvOffload
	]?.[selection.routing]?.[0];
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
	const replicasList = replicasOptions(dict, workload, gpu, gpus);
	const replicas = replicasList.includes(selection.replicas)
		? selection.replicas
		: (replicasList[0] ?? '');
	const kvList = kvOffloadOptions(dict, workload, gpu, gpus, replicas);
	const kvOffload = kvList.includes(selection.kvOffload)
		? selection.kvOffload
		: kvList.includes('false')
			? 'false'
			: (kvList[0] ?? '');
	const routingList = routingOptions(dict, workload, gpu, gpus, replicas, kvOffload);
	const routing = routingList.includes(selection.routing)
		? selection.routing
		: routingList.includes('false')
			? 'false'
			: (routingList[0] ?? '');
	return { workload, gpu, gpus, replicas, kvOffload, routing };
}

export function defaultSelection(dict: TemplateDict): Selection {
	return coerceSelection(dict, {
		workload: '',
		gpu: '',
		gpus: '',
		replicas: '',
		kvOffload: 'false',
		routing: 'false'
	});
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
			annotations['template.otterscale.io/model-name']?.trim() ||
			object.spec?.model?.name?.trim() ||
			name,
		vendor: annotations['template.otterscale.io/vendor']?.trim() || null,
		modelUri: object.spec?.model?.uri?.trim() || null,
		description: annotations['template.otterscale.io/description']?.trim() || null
	};
}

export interface TemplateResources {
	cpu: string | null;
	memory: string | null;
	/** The GPU share, e.g. "2 x 1/2 GPU", from the gpu-usage annotation. */
	gpu: string | null;
	/** The VRAM total, e.g. "95.6 GiB", from the gpu-usage annotation. */
	vram: string | null;
}

export function templateResources(object: ModelTemplateObject): TemplateResources {
	const containers = object.spec?.template?.containers ?? [];
	const container = containers.find((entry) => entry.name === 'main') ?? containers[0];
	const requests = container?.resources?.requests ?? {};
	const limits = container?.resources?.limits ?? {};
	const read = (key: string) => {
		const raw = requests[key] ?? limits[key];
		return raw === undefined ? null : String(raw);
	};
	const usage = object.metadata?.annotations?.['template.otterscale.io/gpu-usage']?.trim();
	let gpu: string | null = null;
	let vram: string | null = null;
	if (usage) {
		const match = usage.match(/^(.*?),\s*(.+?)\s*VRAM$/);
		if (match) {
			gpu = match[1].trim();
			vram = match[2].trim();
		} else {
			gpu = usage;
		}
	}
	return {
		cpu: read('cpu'),
		memory: read('memory'),
		gpu,
		vram
	};
}

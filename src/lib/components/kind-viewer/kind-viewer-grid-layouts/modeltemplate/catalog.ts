/**
 * Model template catalog.
 *
 * The LLMInferenceServiceConfigs in `otterscale-system` come in two layers,
 * told apart by the `otterscale.io/template-role` label:
 *
 * - A **model entry** (`template-role=model`) declares a model only:
 *   `spec.model` (name and source) plus a description. The model list is the
 *   set of these entries, one card each.
 * - A **deployment template** (`template-role=deployment`) is one way to run
 *   a model. Its labels state exactly what a selection matches on (workload,
 *   GPU model, GPU total, KV cache offload, version) and its annotations what
 *   it displays (capacity, latency, offload tier sizes). It shares the
 *   `otterscale.io/model` label with its model entry.
 *
 * Deploying copies the chosen template with the entry's `spec.model` merged
 * in (`composeTemplate`), so nothing stacks the entry through baseRefs. A
 * template missing a required label is skipped and reported, never guessed
 * from its spec.
 *
 * Nothing here touches Svelte or the network; `catalog.spec.ts` covers it.
 */
import type { NodeInfo } from '$lib/components/gpu-allocation/types';

/**
 * Structural view of an LLMInferenceServiceConfig: what the catalog reads.
 * Both the generated kserve type and a raw JSON object satisfy it.
 */
export type ModelTemplateObject = {
	metadata?: {
		name?: string;
		namespace?: string;
		labels?: Record<string, string>;
		annotations?: Record<string, string>;
	};
	spec?: {
		model?: { name?: string; uri?: string };
		template?: { containers?: Array<{ name?: string; image?: string }> };
	};
};

const PREFIX = 'otterscale.io';

/** Labels: what tells the layers apart and what a selection is matched on. */
export const TEMPLATE_LABELS = {
	role: `${PREFIX}/template-role`,
	model: `${PREFIX}/model`,
	workload: `${PREFIX}/workload`,
	gpu: `${PREFIX}/gpu`,
	gpusInTotal: `${PREFIX}/gpus-in-total`,
	kvOffload: `${PREFIX}/kv-offload`,
	version: `${PREFIX}/template-version`
} as const;

/** Values of `TEMPLATE_LABELS.role`. */
export const TEMPLATE_ROLES = {
	model: 'model',
	deployment: 'deployment'
} as const;

/** Annotations: what a template or model entry displays about itself. */
export const TEMPLATE_ANNOTATIONS = {
	modelName: `${PREFIX}/model-name`,
	vendor: `${PREFIX}/vendor`,
	description: `${PREFIX}/description`,
	vllmVersion: `${PREFIX}/vllm-version`,
	maxModelLen: `${PREFIX}/max-model-len`,
	demandedConcurrency: `${PREFIX}/demanded-concurrency`,
	capacityPerInstance: `${PREFIX}/capacity-per-instance`,
	instances: `${PREFIX}/instances`,
	gpusPerInstance: `${PREFIX}/gpus-per-instance`,
	tensorParallelSize: `${PREFIX}/tensor-parallel-size`,
	provisional: `${PREFIX}/provisional`,
	latencyConditions: `${PREFIX}/latency-conditions`,
	expectedTimeToFirstToken: `${PREFIX}/expected-time-to-first-token-milliseconds`,
	expectedInterTokenLatency: `${PREFIX}/expected-inter-token-latency-milliseconds`,
	worstTimeToFirstToken: `${PREFIX}/worst-time-to-first-token-milliseconds`,
	worstInterTokenLatency: `${PREFIX}/worst-inter-token-latency-milliseconds`,
	gpuKvCache: `${PREFIX}/gpu-kv-cache-gibibytes`,
	kvOffloadCpu: `${PREFIX}/kv-offload-cpu-gibibytes`,
	kvOffloadStorageDefault: `${PREFIX}/kv-offload-storage-default-gibibytes`,
	kvOffloadStorageMinimum: `${PREFIX}/kv-offload-storage-minimum-gibibytes`,
	kvOffloadStorageMaximum: `${PREFIX}/kv-offload-storage-maximum-gibibytes`
} as const;

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

const WORKLOAD_ORDER = ['retrieval', 'document', 'agent'];

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

/** What a template says about itself; every field is absent when the annotation is. */
export interface TemplateDetails {
	vllmVersion: string | null;
	maxModelLen: number | null;
	demandedConcurrency: number | null;
	capacityPerInstance: number | null;
	instances: number | null;
	gpusPerInstance: number | null;
	tensorParallelSize: number | null;
	/** Capacity, resources and latency are predictions, not measurements. */
	provisional: boolean;
	latencyConditions: string | null;
	expectedTimeToFirstTokenMs: number | null;
	expectedInterTokenLatencyMs: number | null;
	worstTimeToFirstTokenMs: number | null;
	worstInterTokenLatencyMs: number | null;
	gpuKvCacheGiB: number | null;
	kvOffloadCpuGiB: number | null;
	kvOffloadStorageDefaultGiB: number | null;
	kvOffloadStorageMinimumGiB: number | null;
	kvOffloadStorageMaximumGiB: number | null;
}

/** The facts a selection is matched on, all read from the labels. */
export interface Selection {
	/** Workload slug, e.g. `agent`. */
	workload: string;
	/** GPU model slug the template was calibrated on, e.g. `rtx-pro-6000`. */
	gpuType: string;
	/** GPUs the whole service occupies. */
	gpuCount: number;
	kvOffload: boolean;
}

export interface TemplateVariant extends Selection {
	name: string;
	namespace: string;
	object: ModelTemplateObject;
	/** Wraps the legacy KV cache middleware image; not standalone, so not copied. */
	middleware: boolean;
	version: number;
	details: TemplateDetails;
}

/** A deployment template left out, and the required labels it lacks or misspells. */
export interface SkippedTemplate {
	name: string;
	labels: string[];
}

/** The model entry a card stands for. */
export interface ModelEntry {
	name: string;
	namespace: string;
	object: ModelTemplateObject;
}

/** What a model entry shows about itself: on its card, its row and the picker header. */
export interface EntrySummary {
	name: string;
	namespace: string;
	modelName: string;
	/** Who publishes the model, e.g. `Alibaba`; null when the entry does not say. */
	vendor: string | null;
	modelUri: string | null;
	description: string | null;
}

export interface ModelGroup {
	modelName: string;
	modelUri: string | null;
	description: string | null;
	entry: ModelEntry;
	variants: TemplateVariant[];
	skipped: SkippedTemplate[];
}

export type Resolution =
	| { kind: 'match'; variant: TemplateVariant; alternatives: TemplateVariant[] }
	| { kind: 'ambiguous'; candidates: TemplateVariant[] }
	| { kind: 'none'; unmet: Array<keyof Selection> };

/* Reading a template */

function label(object: ModelTemplateObject, key: string): string | undefined {
	const value = object.metadata?.labels?.[key]?.trim();
	return value ? value : undefined;
}

function annotation(object: ModelTemplateObject, key: string): string | undefined {
	const value = object.metadata?.annotations?.[key]?.trim();
	return value ? value : undefined;
}

function parseNumber(value: string | undefined): number | null {
	if (value === undefined) return null;
	const number = Number(value);
	return Number.isFinite(number) ? number : null;
}

function parseBoolean(value: string | undefined): boolean | undefined {
	if (value === undefined) return undefined;
	const normalized = value.toLowerCase();
	if (['true', 'yes', 'on', '1'].includes(normalized)) return true;
	if (['false', 'no', 'off', '0'].includes(normalized)) return false;
	return undefined;
}

/** Whole positive numbers only: a GPU memory quantity or fraction is not a card count. */
export function parsePositiveInteger(value: string | undefined): number | null {
	if (value === undefined) return null;
	const count = Number(value.trim());
	if (!Number.isInteger(count) || count <= 0) return null;
	return count;
}

function readDetails(object: ModelTemplateObject): TemplateDetails {
	const read = (key: string) => annotation(object, key);
	const number = (key: string) => parseNumber(read(key));
	return {
		vllmVersion: read(TEMPLATE_ANNOTATIONS.vllmVersion) ?? null,
		maxModelLen: number(TEMPLATE_ANNOTATIONS.maxModelLen),
		demandedConcurrency: number(TEMPLATE_ANNOTATIONS.demandedConcurrency),
		capacityPerInstance: number(TEMPLATE_ANNOTATIONS.capacityPerInstance),
		instances: number(TEMPLATE_ANNOTATIONS.instances),
		gpusPerInstance: number(TEMPLATE_ANNOTATIONS.gpusPerInstance),
		tensorParallelSize: number(TEMPLATE_ANNOTATIONS.tensorParallelSize),
		provisional: parseBoolean(read(TEMPLATE_ANNOTATIONS.provisional)) ?? false,
		latencyConditions: read(TEMPLATE_ANNOTATIONS.latencyConditions) ?? null,
		expectedTimeToFirstTokenMs: number(TEMPLATE_ANNOTATIONS.expectedTimeToFirstToken),
		expectedInterTokenLatencyMs: number(TEMPLATE_ANNOTATIONS.expectedInterTokenLatency),
		worstTimeToFirstTokenMs: number(TEMPLATE_ANNOTATIONS.worstTimeToFirstToken),
		worstInterTokenLatencyMs: number(TEMPLATE_ANNOTATIONS.worstInterTokenLatency),
		gpuKvCacheGiB: number(TEMPLATE_ANNOTATIONS.gpuKvCache),
		kvOffloadCpuGiB: number(TEMPLATE_ANNOTATIONS.kvOffloadCpu),
		kvOffloadStorageDefaultGiB: number(TEMPLATE_ANNOTATIONS.kvOffloadStorageDefault),
		kvOffloadStorageMinimumGiB: number(TEMPLATE_ANNOTATIONS.kvOffloadStorageMinimum),
		kvOffloadStorageMaximumGiB: number(TEMPLATE_ANNOTATIONS.kvOffloadStorageMaximum)
	};
}

/**
 * Describes one deployment template from its labels, or lists the required
 * labels it lacks or misspells.
 */
export function extractVariant(
	object: ModelTemplateObject
): { variant: TemplateVariant } | { invalid: string[] } {
	const workload = label(object, TEMPLATE_LABELS.workload)?.toLowerCase();
	const gpuType = label(object, TEMPLATE_LABELS.gpu)?.toLowerCase();
	const gpuCount = parsePositiveInteger(label(object, TEMPLATE_LABELS.gpusInTotal));
	const kvOffload = parseBoolean(label(object, TEMPLATE_LABELS.kvOffload));
	const version = parsePositiveInteger(label(object, TEMPLATE_LABELS.version));

	if (
		workload === undefined ||
		gpuType === undefined ||
		gpuCount === null ||
		kvOffload === undefined ||
		version === null
	) {
		const invalid: string[] = [];
		if (workload === undefined) invalid.push(TEMPLATE_LABELS.workload);
		if (gpuType === undefined) invalid.push(TEMPLATE_LABELS.gpu);
		if (gpuCount === null) invalid.push(TEMPLATE_LABELS.gpusInTotal);
		if (kvOffload === undefined) invalid.push(TEMPLATE_LABELS.kvOffload);
		if (version === null) invalid.push(TEMPLATE_LABELS.version);
		return { invalid };
	}

	return {
		variant: {
			name: object.metadata?.name ?? '',
			namespace: object.metadata?.namespace ?? '',
			object,
			workload,
			gpuType,
			gpuCount,
			kvOffload,
			middleware: (object.spec?.template?.containers ?? []).some((container) =>
				(container.image ?? '').includes('/ai-mw/')
			),
			version,
			details: readDetails(object)
		}
	};
}

function compareVariants(a: TemplateVariant, b: TemplateVariant): number {
	return (
		compareWorkloads(a.workload, b.workload) ||
		a.gpuType.localeCompare(b.gpuType) ||
		a.gpuCount - b.gpuCount ||
		Number(a.kvOffload) - Number(b.kvOffload) ||
		b.version - a.version ||
		a.name.localeCompare(b.name)
	);
}

/** Whether a config is labelled as a model entry. */
export function isModelEntry(object: ModelTemplateObject): boolean {
	return label(object, TEMPLATE_LABELS.role) === TEMPLATE_ROLES.model;
}

/** Reads the display facts off a model entry; the display name falls back to the model, then the name. */
export function describeEntry(object: ModelTemplateObject): EntrySummary {
	const name = object.metadata?.name ?? '';
	return {
		name,
		namespace: object.metadata?.namespace ?? '',
		modelName:
			annotation(object, TEMPLATE_ANNOTATIONS.modelName) ??
			(object.spec?.model?.name?.trim() || name),
		vendor: annotation(object, TEMPLATE_ANNOTATIONS.vendor) ?? null,
		modelUri: object.spec?.model?.uri?.trim() || null,
		description: annotation(object, TEMPLATE_ANNOTATIONS.description) ?? null
	};
}

/**
 * One model entry with its deployment templates: `templates` are the configs
 * a `template-role=deployment` selector on the entry's model label returns.
 */
export function groupForEntry(
	entry: ModelTemplateObject,
	templates: ModelTemplateObject[]
): ModelGroup {
	const summary = describeEntry(entry);
	const variants: TemplateVariant[] = [];
	const skipped: SkippedTemplate[] = [];
	for (const object of templates) {
		const result = extractVariant(object);
		if ('variant' in result) variants.push(result.variant);
		else skipped.push({ name: object.metadata?.name ?? '', labels: result.invalid });
	}
	return {
		modelName: summary.modelName,
		modelUri: summary.modelUri,
		description: summary.description,
		entry: { name: summary.name, namespace: summary.namespace, object: entry },
		variants: variants.sort(compareVariants),
		skipped
	};
}

/**
 * The deployment template as a complete config: the model entry's `spec.model`
 * filled in where the template is silent, so the deployed config needs no
 * baseRef to the entry.
 */
export function composeTemplate(group: ModelGroup, variant: TemplateVariant): ModelTemplateObject {
	// Not structuredClone: Svelte state hands the variant over as a Proxy, which it cannot clone.
	const object = JSON.parse(JSON.stringify(variant.object)) as ModelTemplateObject;
	const entryModel = group.entry.object.spec?.model;
	if (entryModel) {
		const spec = (object.spec ??= {});
		spec.model = { ...entryModel, ...(spec.model ?? {}) };
	}
	return object;
}

/* Options: each level lists only what the templates above it offer. */

export function workloadOptions(group: ModelGroup): string[] {
	return [...new Set(group.variants.map((variant) => variant.workload))].sort(compareWorkloads);
}

function matching(group: ModelGroup, selection: Partial<Selection>): TemplateVariant[] {
	return group.variants.filter(
		(variant) =>
			(selection.workload === undefined || variant.workload === selection.workload) &&
			(selection.gpuType === undefined || variant.gpuType === selection.gpuType) &&
			(selection.gpuCount === undefined || variant.gpuCount === selection.gpuCount) &&
			(selection.kvOffload === undefined || variant.kvOffload === selection.kvOffload)
	);
}

export function gpuTypeOptions(group: ModelGroup, workload: string): string[] {
	return [...new Set(matching(group, { workload }).map((variant) => variant.gpuType))].sort();
}

export function gpuCountOptions(group: ModelGroup, workload: string, gpuType: string): number[] {
	const counts = new Set(matching(group, { workload, gpuType }).map((variant) => variant.gpuCount));
	return [...counts].sort((a, b) => a - b);
}

export function kvOffloadOptions(
	group: ModelGroup,
	workload: string,
	gpuType: string,
	gpuCount: number
): { on: boolean; off: boolean } {
	const variants = matching(group, { workload, gpuType, gpuCount });
	return {
		on: variants.some((variant) => variant.kvOffload),
		off: variants.some((variant) => !variant.kvOffload)
	};
}

/**
 * The first workload, GPU and smallest count, without offload where a
 * template offers that. A group without variants gets a placeholder that no
 * template matches.
 */
export function defaultSelection(group: ModelGroup): Selection {
	const workload = workloadOptions(group)[0];
	if (workload === undefined) return { workload: '', gpuType: '', gpuCount: 0, kvOffload: false };
	const gpuType = gpuTypeOptions(group, workload)[0];
	const gpuCount = gpuCountOptions(group, workload, gpuType)[0];
	const kv = kvOffloadOptions(group, workload, gpuType, gpuCount);
	return { workload, gpuType, gpuCount, kvOffload: !kv.off };
}

/**
 * Re-validates a selection top-down after one field changed, so dependent
 * fields never point at a combination no template offers.
 */
export function coerceSelection(group: ModelGroup, selection: Selection): Selection {
	const workloads = workloadOptions(group);
	if (workloads.length === 0) return selection;
	const workload = workloads.includes(selection.workload) ? selection.workload : workloads[0];

	const types = gpuTypeOptions(group, workload);
	const gpuType = types.includes(selection.gpuType) ? selection.gpuType : types[0];

	const counts = gpuCountOptions(group, workload, gpuType);
	const gpuCount = counts.includes(selection.gpuCount) ? selection.gpuCount : counts[0];

	const kv = kvOffloadOptions(group, workload, gpuType, gpuCount);
	let kvOffload = selection.kvOffload;
	if (kvOffload && !kv.on) kvOffload = false;
	if (!kvOffload && !kv.off) kvOffload = true;

	return { workload, gpuType, gpuCount, kvOffload };
}

/**
 * Picks the template for a selection. All four facts must match; among
 * several versions the newest wins, and equal versions are reported as a tie.
 */
export function resolveTemplate(group: ModelGroup, selection: Selection): Resolution {
	const steps: Array<[keyof Selection, Partial<Selection>]> = [
		['workload', { workload: selection.workload }],
		['gpuType', { workload: selection.workload, gpuType: selection.gpuType }],
		[
			'gpuCount',
			{ workload: selection.workload, gpuType: selection.gpuType, gpuCount: selection.gpuCount }
		],
		['kvOffload', selection]
	];
	let candidates: TemplateVariant[] = group.variants;
	for (const [field, partial] of steps) {
		candidates = matching(group, partial);
		if (candidates.length === 0) return { kind: 'none', unmet: [field] };
	}
	const ranked = [...candidates].sort(compareVariants);
	const newest = ranked[0].version;
	const top = ranked.filter((variant) => variant.version === newest);
	if (top.length > 1) return { kind: 'ambiguous', candidates: top };
	return { kind: 'match', variant: ranked[0], alternatives: ranked.slice(1) };
}

/* Cluster GPU topology */

export interface GpuTypeSummary {
	/** Device model as HAMi registers it, e.g. `NVIDIA RTX PRO 6000 Blackwell Server Edition`. */
	type: string;
	/** Nodes carrying at least one usable card of this type. */
	nodeCount: number;
	/** Most usable cards of this type on any single node. */
	maxPerNode: number;
	totalCards: number;
	/** Frame buffer of one card in MiB, when HAMi reports it. */
	memoryMiB: number | null;
}

/**
 * Whole, healthy cards per GPU model. MIG-mode cards are split into slices
 * and cannot back a whole-GPU request, so they are left out.
 */
export function summarizeGpuTopology(nodes: NodeInfo[]): GpuTypeSummary[] {
	const summaries = new Map<string, GpuTypeSummary>();
	for (const node of nodes) {
		const perType = new Map<string, number>();
		for (const device of node.devices) {
			if (!device.type || device.health === false || device.mode === 'mig') continue;
			perType.set(device.type, (perType.get(device.type) ?? 0) + 1);
			const summary = summaries.get(device.type);
			if (summary) {
				if (summary.memoryMiB === null && device.devmem > 0) summary.memoryMiB = device.devmem;
			} else {
				summaries.set(device.type, {
					type: device.type,
					nodeCount: 0,
					maxPerNode: 0,
					totalCards: 0,
					memoryMiB: device.devmem > 0 ? device.devmem : null
				});
			}
		}
		for (const [type, count] of perType) {
			const summary = summaries.get(type)!;
			summary.nodeCount++;
			summary.totalCards += count;
			summary.maxPerNode = Math.max(summary.maxPerNode, count);
		}
	}
	return [...summaries.values()].sort((a, b) => a.type.localeCompare(b.type));
}

function normalizeGpuName(name: string): string {
	return name.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function namesGpu(gpuType: string, clusterType: string): boolean {
	return normalizeGpuName(clusterType).includes(normalizeGpuName(gpuType));
}

/**
 * Cluster GPU models that a template GPU slug names: `rtx-pro-6000` matches
 * `NVIDIA RTX PRO 6000 Blackwell Server Edition`.
 */
export function clusterGpuTypesFor(gpuType: string, summaries: GpuTypeSummary[]): GpuTypeSummary[] {
	return summaries.filter((summary) => namesGpu(gpuType, summary.type));
}

/**
 * The one cluster GPU model a template GPU slug names, to pin at deploy;
 * undefined when the template names none, or when none or several match.
 */
export function pinClusterGpuType(
	gpuType: string | undefined,
	clusterTypes: string[]
): string | undefined {
	if (!gpuType || !normalizeGpuName(gpuType)) return undefined;
	const matches = clusterTypes.filter((type) => namesGpu(gpuType, type));
	return matches.length === 1 ? matches[0] : undefined;
}

/** Whether one node of the type can hold every GPU the service needs. */
export function fitsOnOneNode(summary: GpuTypeSummary, gpuCount: number): boolean {
	return summary.maxPerNode >= gpuCount;
}

/**
 * Model Overview v2: one row per model. Everything here is pure, so the rules the page shows
 * (status, order, colours, number formats) are tested without a browser.
 */

import { DASH } from '$lib/components/dashboard/kit/format';
import type { Tone } from '$lib/components/dashboard/kit/tone';

export { DASH };
export type { Tone };

/** KV cache levels, in percent of the busiest pod. */
export const KV_WARN = 80;
export const KV_CRIT = 90;

/** Four categorical colours, so a chart draws at most four models. */
export const MODEL_COLORS = [
	'var(--chart-6)',
	'var(--chart-7)',
	'var(--chart-8)',
	'var(--chart-9)'
];

/** Rows shown before "Show all": problems sort first, so they are always among them. */
export const TABLE_ROWS = 10;

const STANDALONE = 'standalone:';

/**
 * A model is a managed `llm_inference_service`, or a standalone vLLM keyed by its `model_name`,
 * within a namespace. The id after the namespace is what the Analytics model picker selects.
 */
export function modelKey(namespace: string, service: string, modelName = ''): string {
	return `${namespace}/${service || STANDALONE + modelName}`;
}

/** The picker's value for a model key: the service, or `standalone:<model_name>`. */
export function pickerId(key: string): string {
	return key.slice(key.indexOf('/') + 1);
}

export function modelKeyFromLabels(labels: Record<string, string | undefined>): string {
	return modelKey(labels.namespace ?? '', labels.llm_inference_service ?? '', labels.model_name);
}

export type ModelRow = {
	key: string;
	name: string;
	namespace: string;
	/** Ready replicas. Undefined when unknown. */
	ready?: number;
	/** Desired replicas. Undefined when unknown. */
	desired?: number;
	/** Requests per second, last 5 minutes. */
	rps?: number;
	/** Generation tokens per second, last 5 minutes. */
	gen?: number;
	/** Prompt tokens per second, last 5 minutes. */
	prompt?: number;
	/** p95 seconds over the last 5 minutes. */
	ttft?: number;
	tpot?: number;
	e2e?: number;
	/** Busiest pod's KV cache, in percent. */
	kv?: number;
	waiting?: number;
	/** Requests finished in the selected window; 0 or undefined means no traffic. */
	windowRequests?: number;
};

export type ModelState = 'starting' | 'queueing' | 'idle' | 'serving';

export type ModelStatus = { state: ModelState; tone: Tone };

/**
 * The first rule that matches, top to bottom (SPEC 3.2):
 * Starting (no replica ready yet), Queueing (KV ≥ 90 % or anything waiting),
 * No traffic (no request in the window), Serving.
 */
export function modelStatus(row: ModelRow): ModelStatus {
	const ready = row.ready ?? 0;
	if (row.desired !== undefined && ready < row.desired && ready === 0) {
		return { state: 'starting', tone: 'warn' };
	}
	const kvHigh = (row.kv ?? 0) >= KV_CRIT;
	if (kvHigh || (row.waiting ?? 0) > 0) {
		return { state: 'queueing', tone: kvHigh ? 'bad' : 'warn' };
	}
	if (!((row.windowRequests ?? 0) > 0)) return { state: 'idle', tone: 'muted' };
	return { state: 'serving', tone: 'ok' };
}

export function hasProblem(row: ModelRow): boolean {
	const { state } = modelStatus(row);
	return state === 'starting' || state === 'queueing';
}

/** Models with a problem first, then by requests per second, busiest first; ties by name. */
export function sortModels(rows: ModelRow[]): ModelRow[] {
	return [...rows].sort((a, b) => {
		const pa = hasProblem(a) ? 0 : 1;
		const pb = hasProblem(b) ? 0 : 1;
		if (pa !== pb) return pa - pb;
		const ra = a.rps ?? -1;
		const rb = b.rps ?? -1;
		if (ra !== rb) return rb - ra;
		return a.name.localeCompare(b.name) || a.namespace.localeCompare(b.namespace);
	});
}

/** The name a model is shown by: the service, or a standalone model's `model_name`. */
export function displayName(key: string): string {
	const id = pickerId(key);
	return id.startsWith(STANDALONE) ? id.slice(STANDALONE.length) || '(unknown)' : id;
}

/**
 * The models the charts draw: the busiest four by requests in the window (ties by name). The rest
 * are left to the table, since a summed "Other" line would flatten the four.
 */
export function chartModels(
	keys: string[],
	requests: Map<string, number> | undefined,
	limit = MODEL_COLORS.length
): string[] {
	const busy = (key: string) => requests?.get(key) ?? 0;
	return [...new Set(keys)]
		.sort((a, b) => busy(b) - busy(a) || displayName(a).localeCompare(displayName(b)))
		.slice(0, limit);
}

/**
 * A colour per drawn model that follows the model, not its rank: the drawn models sorted by name
 * take chart-6 to chart-9, and both charts share the map.
 */
export function modelColors(keys: string[]): Map<string, string> {
	const sorted = [...new Set(keys)]
		.sort((a, b) => displayName(a).localeCompare(displayName(b)) || a.localeCompare(b))
		.slice(0, MODEL_COLORS.length);
	return new Map(sorted.map((key, i) => [key, MODEL_COLORS[i]]));
}

/** A round top for a y axis whose half is round too: 6 → 6, 13 → 16, 0 → 1. */
export function niceTop(max: number): number {
	if (!(max > 0)) return 1;
	if (max <= 1) return Math.ceil(max * 10) / 10 || 0.1;
	if (max <= 10) return Math.max(2, Math.ceil(max / 2) * 2);
	const p = 10 ** Math.floor(Math.log10(max));
	for (const f of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (f * p >= max - 1e-9) return f * p;
	return 10 * p;
}

/** KV cache tone: ≥ 90 bad, ≥ 80 warn, otherwise plain. */
export function kvTone(kv: number | undefined): Tone | undefined {
	if (kv === undefined || !Number.isFinite(kv)) return undefined;
	if (kv >= KV_CRIT) return 'bad';
	if (kv >= KV_WARN) return 'warn';
	return undefined;
}

export type Summary = {
	total: number;
	serving: number;
	starting: number;
	rps?: number;
	gen?: number;
	prompt?: number;
	waiting?: number;
	waitingIn: string[];
	kv?: number;
	kvModel?: string;
};

function sum(values: (number | undefined)[]): number | undefined {
	const finite = values.filter((v): v is number => v !== undefined && Number.isFinite(v));
	return finite.length ? finite.reduce((a, b) => a + b, 0) : undefined;
}

export function summarize(rows: ModelRow[]): Summary {
	let kv: number | undefined;
	let kvModel: string | undefined;
	for (const row of rows) {
		if (row.kv !== undefined && Number.isFinite(row.kv) && (kv === undefined || row.kv > kv)) {
			kv = row.kv;
			kvModel = row.name;
		}
	}
	return {
		total: rows.length,
		serving: rows.filter((r) => (r.ready ?? 0) > 0).length,
		starting: rows.filter((r) => modelStatus(r).state === 'starting').length,
		rps: sum(rows.map((r) => r.rps)),
		gen: sum(rows.map((r) => r.gen)),
		prompt: sum(rows.map((r) => r.prompt)),
		waiting: sum(rows.map((r) => r.waiting)),
		waitingIn: rows
			.filter((r) => (r.waiting ?? 0) > 0)
			.sort((a, b) => (b.waiting ?? 0) - (a.waiting ?? 0))
			.map((r) => r.name),
		kv,
		kvModel
	};
}

const finite = (v: number | undefined): v is number => v !== undefined && Number.isFinite(v);

/** Seconds: `120 ms`, `1.9 s`, `24 s`. */
export function fmtSeconds(v: number | undefined): string {
	if (!finite(v)) return DASH;
	if (v < 1) return `${Math.round(v * 1000)} ms`;
	return `${v.toFixed(v >= 10 ? 0 : 1)} s`;
}

/** Seconds shown in whole milliseconds: `62 ms`. */
export function fmtMillis(v: number | undefined): string {
	if (!finite(v)) return DASH;
	return v >= 1 ? fmtSeconds(v) : `${Math.round(v * 1000)} ms`;
}

/** Rates and counts: `0.0`, `6.8`, `240`, `1.4K`, `11K`. */
export function fmtRate(v: number | undefined): string {
	if (!finite(v)) return DASH;
	if (v >= 1000) return `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}K`;
	return v.toFixed(v < 10 ? 1 : 0);
}

export function fmtPercent(v: number | undefined): string {
	return finite(v) ? `${Math.round(v)}%` : DASH;
}

export function fmtCount(v: number | undefined): string {
	return finite(v) ? String(Math.round(v)) : DASH;
}

/** `2/2`, `0/1`; a dash when the desired count is unknown. */
export function fmtReplicas(row: ModelRow): string {
	if (row.desired === undefined) return row.ready === undefined ? DASH : String(row.ready);
	return `${row.ready ?? 0}/${row.desired}`;
}

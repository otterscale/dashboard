import {
	kvTone,
	type ModelRow,
	type ModelState,
	modelStatus,
	type Tone
} from '../../overview/lib/models';

/**
 * Model ranking: one row per model, ordered by the picked number. Status and the KV levels are
 * Overview v2's own rules (`modelStatus`, `kvTone`), so both pages call a model the same thing.
 */

export type RankTab = 'throughput' | 'requests' | 'kv' | 'p99';
export const RANK_TABS: RankTab[] = ['throughput', 'requests', 'kv', 'p99'];
export const DEFAULT_TAB: RankTab = 'requests';

export function tabFromParam(value: string | null): RankTab {
	return RANK_TABS.includes(value as RankTab) ? (value as RankTab) : DEFAULT_TAB;
}

export type RankedModel = ModelRow & {
	running?: number;
	/** Average KV cache over the model's pods, in percent; `kv` is the busiest pod. */
	kvAvg?: number;
	e2eP99?: number;
	ttftP99?: number;
};

/** A row that has no number to rank by: still starting, or no request in the window. */
export function quietState(row: ModelRow): 'starting' | 'idle' | undefined {
	const { state } = modelStatus(row);
	return state === 'starting' || state === 'idle' ? state : undefined;
}

/** The number a tab ranks by. */
export function rankValue(row: RankedModel, tab: RankTab): number | undefined {
	switch (tab) {
		case 'throughput':
			return row.gen;
		case 'requests':
			return row.running === undefined && row.waiting === undefined
				? undefined
				: (row.running ?? 0) + (row.waiting ?? 0);
		case 'kv':
			return row.kvAvg;
		case 'p99':
			return row.e2eP99;
	}
}

/**
 * Highest first; Starting and No traffic go last (Starting before No traffic), then by name.
 */
export function rankModels(rows: RankedModel[], tab: RankTab): RankedModel[] {
	const group = (row: RankedModel) => {
		const quiet = quietState(row);
		return quiet === 'starting' ? 1 : quiet === 'idle' ? 2 : 0;
	};
	return [...rows].sort((a, b) => {
		const ga = group(a);
		const gb = group(b);
		if (ga !== gb) return ga - gb;
		const va = rankValue(a, tab) ?? -1;
		const vb = rankValue(b, tab) ?? -1;
		if (ga === 0 && va !== vb) return vb - va;
		return a.name.localeCompare(b.name) || a.namespace.localeCompare(b.namespace);
	});
}

/** The bar: a dark part and, for Requests, the waiting part after it. Both 0–100 of the track. */
export type RankBar = { solid: number; soft?: number };

export function rankBar(row: RankedModel, tab: RankTab, max: number): RankBar {
	const pct = (v: number | undefined) => (max > 0 && v ? Math.min(100, (v / max) * 100) : 0);
	if (tab === 'kv') return { solid: Math.min(100, Math.max(0, row.kvAvg ?? 0)) };
	if (tab === 'requests') {
		const running = row.running ?? 0;
		const waiting = row.waiting ?? 0;
		return { solid: pct(running), soft: waiting > 0 ? pct(running + waiting) : undefined };
	}
	return { solid: pct(rankValue(row, tab)) };
}

/** The top of the bar scale for a tab: the largest value among the rows (KV is always 0–100). */
export function rankMax(rows: RankedModel[], tab: RankTab): number {
	if (tab === 'kv') return 100;
	return Math.max(0, ...rows.map((r) => rankValue(r, tab) ?? 0));
}

/** Text colour for a tone; `ok` stays plain in tables, where green would be noise. */
export const TONE_TEXT: Record<Tone, string> = {
	ok: 'text-chart-2',
	warn: 'text-chart-1',
	bad: 'text-destructive',
	muted: 'text-muted-foreground'
};

/** Waiting > 0 is worth a look. */
export function waitingClass(waiting: number | undefined): string | undefined {
	return (waiting ?? 0) > 0 ? TONE_TEXT.warn : undefined;
}

/** KV cache: ≥ 90 % bad, ≥ 80 % warn (Overview's levels). */
export function kvClass(kv: number | undefined): string | undefined {
	const tone = kvTone(kv);
	return tone ? TONE_TEXT[tone] : undefined;
}

/** Pick the model to show: the one asked for (a full key, or a bare id from an older link), else the first. */
export function pickModel(keys: string[], wanted: string | undefined): string | undefined {
	if (keys.length === 0) return undefined;
	if (wanted) {
		if (keys.includes(wanted)) return wanted;
		const bare = wanted.startsWith('standalone:') || !wanted.includes('/');
		const id = bare ? wanted : wanted.slice(wanted.indexOf('/') + 1);
		const match = keys.find((k) => k.slice(k.indexOf('/') + 1) === id);
		if (match) return match;
	}
	return keys[0];
}

export type { ModelState, Tone };

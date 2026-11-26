import {
	rangeFromParams,
	rangeToParams,
	type TimeRange
} from '$lib/components/custom/range-picker/time-range';

import type { SortKey, View } from './usage';

/** Usage opens on the last 24 hours; the other tabs keep their own default. */
export const USAGE_DEFAULT_RANGE: TimeRange = { kind: 'relative', minutes: 24 * 60 };

const VIEWS: View[] = ['user', 'key', 'workspace', 'model'];
const SORTS: SortKey[] = ['tokens', 'requests', 'failed'];

/** Every query key the Usage tab owns, so leaving the tab can clear them. */
export const USAGE_PARAM_KEYS = ['by', 'sort', 'sel', 'ws', 'range', 'from', 'to'];

export type UsageParams = {
	view: View;
	sort: SortKey;
	/** The selected row of the current view; the others are remembered in memory only. */
	selected?: string;
	/** Admin's Workspace filter, as a namespace; empty for all Workspaces. */
	namespace: string;
	range: TimeRange;
};

export function usageFromParams(params: URLSearchParams): UsageParams {
	const by = params.get('by') as View | null;
	const sort = params.get('sort') as SortKey | null;
	const hasRange = params.has('range') || (params.has('from') && params.has('to'));
	return {
		view: by && VIEWS.includes(by) ? by : 'user',
		sort: sort && SORTS.includes(sort) ? sort : 'tokens',
		selected: params.get('sel') ?? undefined,
		namespace: params.get('ws') ?? '',
		range: hasRange ? rangeFromParams(params) : USAGE_DEFAULT_RANGE
	};
}

/** Defaults are left out, so the plain `?tab=usage` stays short. */
export function usageToParams(p: UsageParams): [string, string][] {
	const out: [string, string][] = [];
	if (p.view !== 'user') out.push(['by', p.view]);
	if (p.sort !== 'tokens') out.push(['sort', p.sort]);
	if (p.selected) out.push(['sel', p.selected]);
	if (p.namespace) out.push(['ws', p.namespace]);
	const isDefault =
		p.range.kind === 'relative' &&
		USAGE_DEFAULT_RANGE.kind === 'relative' &&
		p.range.minutes === USAGE_DEFAULT_RANGE.minutes;
	if (!isDefault) out.push(...Object.entries(rangeToParams(p.range)));
	return out;
}

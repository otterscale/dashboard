import { rangeFromParams, type TimeRange } from '$lib/components/custom/range-picker';

/** History opens on the last 24 hours; a link's `range`, or `from` and `to`, overrides that. */
export const DEFAULT_HISTORY_RANGE: TimeRange = { kind: 'relative', minutes: 1440 };

export function historyRangeFromParams(params: URLSearchParams): TimeRange {
	return ['range', 'from', 'to'].some((key) => params.has(key))
		? rangeFromParams(params)
		: DEFAULT_HISTORY_RANGE;
}

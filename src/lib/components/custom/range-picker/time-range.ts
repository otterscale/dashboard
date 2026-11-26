/**
 * The History window. `relative` is "the last N minutes", anchored when it is picked or
 * refreshed; `absolute` is a fixed pair of times that stays put until changed.
 */
export type TimeRange =
	| { kind: 'relative'; minutes: number }
	| { kind: 'absolute'; from: number; to: number };

export const PRESET_MINUTES = [15, 60, 180, 360, 720, 1440, 10080];
export const DEFAULT_RANGE: TimeRange = { kind: 'relative', minutes: 60 };

const MINUTE = 60_000;

/** Start and end, in ms. A relative range ends at `anchor`. */
export function resolveRange(range: TimeRange, anchor: number): { start: number; end: number } {
	if (range.kind === 'absolute') return { start: range.from, end: range.to };
	return { start: anchor - range.minutes * MINUTE, end: anchor };
}

/**
 * Move the window by its own length. Moving back always gives a fixed window; moving forward
 * onto "now" turns it back into "the last N minutes".
 */
export function shiftRange(
	range: TimeRange,
	anchor: number,
	direction: -1 | 1,
	now: number
): TimeRange {
	const { start, end } = resolveRange(range, anchor);
	const length = end - start;
	const from = start + direction * length;
	const to = end + direction * length;
	if (direction === 1 && to >= now - MINUTE) {
		return { kind: 'relative', minutes: Math.round(length / MINUTE) };
	}
	return { kind: 'absolute', from, to };
}

/** The window's length in minutes. */
export function rangeMinutes(range: TimeRange): number {
	return range.kind === 'relative' ? range.minutes : Math.round((range.to - range.from) / MINUTE);
}

/** The same length, ending now. */
export function toNow(range: TimeRange): TimeRange {
	return { kind: 'relative', minutes: rangeMinutes(range) };
}

/** Change the length and keep where the window ends: "now" stays now, a past end stays put. */
export function withLength(range: TimeRange, minutes: number): TimeRange {
	if (range.kind === 'relative') return { kind: 'relative', minutes };
	return { kind: 'absolute', from: range.to - minutes * MINUTE, to: range.to };
}

/**
 * Put a window of the same length on a day. A past day's window ends at its midnight, so
 * "1 day" covers it exactly; today's window ends now.
 */
export function onDay(range: TimeRange, dayStart: number, now: number): TimeRange {
	const minutes = rangeMinutes(range);
	const dayEnd = new Date(dayStart);
	dayEnd.setDate(dayEnd.getDate() + 1);
	if (dayEnd.getTime() > now) return { kind: 'relative', minutes };
	return { kind: 'absolute', from: dayEnd.getTime() - minutes * MINUTE, to: dayEnd.getTime() };
}

/** URL form: `range=60` for relative, `from`/`to` in Unix seconds for absolute. */
export function rangeToParams(range: TimeRange): Record<string, string> {
	if (range.kind === 'relative') return { range: String(range.minutes) };
	return { from: String(Math.round(range.from / 1000)), to: String(Math.round(range.to / 1000)) };
}

export function rangeFromParams(params: URLSearchParams): TimeRange {
	const from = Number(params.get('from'));
	const to = Number(params.get('to'));
	if (Number.isFinite(from) && Number.isFinite(to) && from > 0 && to > from) {
		return { kind: 'absolute', from: from * 1000, to: to * 1000 };
	}
	const minutes = Number(params.get('range'));
	if (Number.isFinite(minutes) && minutes >= 1)
		return { kind: 'relative', minutes: Math.round(minutes) };
	return DEFAULT_RANGE;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `16:04 – 17:04`, with dates added when the window crosses midnight or is not today. */
export function formatSpan(start: number, end: number, now = Date.now()): string {
	const s = new Date(start);
	const e = new Date(end);
	const time = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
	const day = (d: Date) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
	const sameDay = s.toDateString() === e.toDateString();
	const today = e.toDateString() === new Date(now).toDateString();
	if (sameDay && today) return `${time(s)} – ${time(e)}`;
	if (sameDay) return `${day(s)} ${time(s)} – ${time(e)}`;
	return `${day(s)} ${time(s)} – ${day(e)} ${time(e)}`;
}

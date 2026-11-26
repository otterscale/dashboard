import { formatDuration } from '$lib/components/dashboard/kit/format';
import { m } from '$lib/messages';

import type { Growth } from '../../overview/ceph';
import { DASH, fmtBytes } from '../../overview/format';

export { formatDuration as fmtAgo };

/** "+18.0 GiB/day", "Flat", or a dash when there is no estimate. */
export function fmtGrowth(growth: Growth | undefined): string {
	if (!growth) return DASH;
	if (growth.kind === 'flat') return m.storage_growth_flat();
	const sign = growth.kind === 'growing' ? '+' : '';
	return m.storage_per_day({ value: `${sign}${fmtBytes(growth.perDay)}` });
}

/** The growth without "/day", for a card that says "per day" underneath. */
export function fmtGrowthAmount(growth: Growth): string {
	return `${growth.kind === 'growing' ? '+' : ''}${fmtBytes(growth.perDay)}`;
}

/** Ceph's device classes and object stores as Ceph writes them in its docs. */
const NAMES: Record<string, string> = {
	nvme: 'NVMe',
	ssd: 'SSD',
	hdd: 'HDD',
	bluestore: 'BlueStore',
	filestore: 'FileStore'
};
export function cephName(value: string | undefined): string {
	if (!value) return DASH;
	return NAMES[value.toLowerCase()] ?? value;
}

/** A count with thousands separators and no decimals. */
export function fmtWhole(value: number | undefined): string {
	if (value === undefined || !Number.isFinite(value)) return DASH;
	return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value);
}

/** "Oct 28", with the year when it is not this year. */
export function fmtDate(unixSeconds: number | undefined, now = Date.now()): string {
	if (unixSeconds === undefined || !Number.isFinite(unixSeconds)) return DASH;
	const date = new Date(unixSeconds * 1000);
	const sameYear = date.getFullYear() === new Date(now).getFullYear();
	return date.toLocaleDateString([], {
		month: 'short',
		day: 'numeric',
		...(sameYear ? {} : { year: 'numeric' })
	});
}

/** "Last 7 days" for a window ending now; the span itself for a fixed one. */
export function windowTitle(minutes: number, endsNow: boolean, span: string): string {
	if (!endsNow) return span;
	const length =
		minutes === 1440
			? m.time_range_span_one_day()
			: minutes % 1440 === 0
				? m.time_range_span_days({ count: String(minutes / 1440) })
				: minutes === 60
					? m.time_range_span_one_hour()
					: minutes % 60 === 0
						? m.time_range_span_hours({ count: String(minutes / 60) })
						: m.time_range_span_minutes({ count: String(minutes) });
	return m.time_range_last_span({ span: length });
}

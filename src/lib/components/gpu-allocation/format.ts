/** Format a memory amount given in MiB into a human-friendly string. */
export function formatMemory(mib: number): string {
	if (!Number.isFinite(mib) || mib <= 0) return '0 MiB';
	if (mib >= 1024) {
		const gib = mib / 1024;
		return `${gib >= 10 ? Math.round(gib) : gib.toFixed(1)} GiB`;
	}
	return `${Math.round(mib)} MiB`;
}

/** Safe percentage (0-100) of used/total, rounded to an integer. */
export function toPercent(used: number, total: number): number {
	if (!Number.isFinite(total) || total <= 0) return 0;
	return Math.min(100, Math.round((used / total) * 100));
}

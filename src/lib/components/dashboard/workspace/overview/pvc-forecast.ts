const GIB = 1024 ** 3;

/** Below this a volume is "flat": a forecast from it would be noise. */
export const MIN_GROWTH_BYTES_PER_DAY = 0.1 * GIB;

/** A forecast further out than this is not worth a line on the card. */
export const FULL_SOON_DAYS = 30;

/**
 * Days until a volume is full at its current growth, or `null` when it is not growing by at
 * least 0.1 GiB a day. A volume already full is 0 days away.
 *
 * @param growthPerDay bytes per day, `deriv(kubelet_volume_stats_used_bytes[7d]) * 86400`
 */
export function daysUntilFull(capacity: number, used: number, growthPerDay: number): number | null {
	if (!Number.isFinite(capacity) || !Number.isFinite(used) || capacity <= 0) return null;
	if (used >= capacity) return 0;
	if (!Number.isFinite(growthPerDay) || growthPerDay < MIN_GROWTH_BYTES_PER_DAY) return null;
	return Math.max(1, Math.round((capacity - used) / growthPerDay));
}

export type VolumeReading = {
	name: string;
	capacity: number;
	used: number;
	growthPerDay: number | null;
};

export type VolumeRow = { name: string; percent: number; fullInDays: number | null };

/**
 * The volumes closest to full: those with a forecast inside 30 days first, soonest first, then
 * the rest by how full they are.
 */
export function fillingFirst(volumes: VolumeReading[], limit = 3): VolumeRow[] {
	return volumes
		.filter((volume) => volume.capacity > 0)
		.map((volume) => {
			const days =
				volume.growthPerDay === null
					? null
					: daysUntilFull(volume.capacity, volume.used, volume.growthPerDay);
			return {
				name: volume.name,
				percent: (100 * volume.used) / volume.capacity,
				fullInDays: days !== null && days <= FULL_SOON_DAYS ? days : null
			};
		})
		.sort(
			(a, b) =>
				(a.fullInDays ?? Infinity) - (b.fullInDays ?? Infinity) ||
				b.percent - a.percent ||
				a.name.localeCompare(b.name)
		)
		.slice(0, limit);
}

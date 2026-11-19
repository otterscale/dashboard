import type { Level } from '$lib/components/dashboard/shared/status';

/** One row of a {@link RankingList}. What each field means is up to the caller. */
export type RankingRow = {
	label: string;
	/** Sizes the bar, relative to the largest value in the list. */
	value: number;
	/** The reading printed beside (or under) the name. */
	displayValue: string;
	/** Click payload and list key. Defaults to `label`. */
	id?: string;
	/** Threshold level of the row. Leave out for a plain ranking: the bar is the primary colour. */
	level?: Level;
	/** A short tag after the name. */
	badge?: string;
	/** A caveat about the reading, shown as a warning mark with this text as its tooltip. */
	warning?: string;
	/** Stacked breakdown of `value`; `class` is each segment's fill. Replaces the single bar. */
	segments?: { value: number; class: string }[];
};

export type RankingLegend = { label: string; class: string }[];

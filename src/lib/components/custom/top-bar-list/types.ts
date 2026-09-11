/** A single bar in a {@link TopBarList}. The component is category-agnostic: callers
 * (model, namespace, node, …) decide what each field means. */
export type TopBar = {
	label: string;
	value: number;
	displayValue: string;
	barClass?: string;
	textClass?: string;
	// Click payload / list key; defaults to `label` when omitted. Lets a bar display a
	// human-friendly name while clicking through a distinct identity token.
	id?: string;
	// Optional short tag shown next to the label (e.g. to mark a standalone model).
	badge?: string;
	// Optional caveat about `displayValue` itself — rendered as a marker beside it, with this
	// text as the tooltip. For values that are arithmetically right but incomplete, where the
	// number would otherwise read as the whole story.
	warning?: string;
	// Optional stacked breakdown of `value`. When set, the track is split into one segment
	// per entry, sized in proportion to `segment.value` (they should sum to `value`), and
	// `barClass` is ignored; `class` is the segment's fill (e.g. `bg-chart-2`). Pair with
	// `TopBarList`'s `legend` so the colours are named.
	segments?: { value: number; class: string }[];
};

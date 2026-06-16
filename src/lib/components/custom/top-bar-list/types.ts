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
};

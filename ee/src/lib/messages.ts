// EE overlay of src/lib/messages.ts: swaps branded message keys for their
// _ee variants. All other keys pass through unchanged.
import { m as base } from '$lib/paraglide/messages';

export const m = {
	...base,
	site_title: base.site_title_ee,
	join_1: base.join_1_ee,
	join_2: base.join_2_ee,
	license_description: base.license_description_ee,
	license_export_description: base.license_export_description_ee
};

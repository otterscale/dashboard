import { redirect } from '@sveltejs/kit';

import type { PageLoad } from './$types';

// Model templates are a licensed feature: without a valid license the route
// is not available.
export const load: PageLoad = async ({ parent, params }) => {
	const { isRestricted } = await parent();
	if (isRestricted) {
		redirect(307, `/${params.cluster}/${params.workspace}`);
	}
};

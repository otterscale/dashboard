import { getTimezones } from '$lib/server/timezones';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return {
		timezones: getTimezones()
	};
};

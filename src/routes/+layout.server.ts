import { getIsRestricted } from '$lib/server/mode';
import { getTimezones } from '$lib/server/timezones';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
	return {
		timezones: getTimezones(),
		isRestricted: await getIsRestricted()
	};
};

import type { LayoutServerLoad } from './$types';
import { getTimezones } from '$lib/server/timezones';

export const load: LayoutServerLoad = async () => {
	return {
		timezones: getTimezones()
	};
};

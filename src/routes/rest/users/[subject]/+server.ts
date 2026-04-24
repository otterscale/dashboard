import { error, json } from '@sveltejs/kit';

import { getUserBySubject } from '$lib/server/users';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}

	const user = await getUserBySubject(params.subject);
	if (!user) {
		error(404, 'User not found');
	}
	return json(user);
};

import { error, json } from '@sveltejs/kit';

import { listProjects } from '$lib/server/harbor';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}

	try {
		const projects = await listProjects();
		return json(projects);
	} catch (err) {
		console.error('Failed to list Harbor projects:', err);
		error(500, 'Failed to list Harbor projects');
	}
};

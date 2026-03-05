import { error, json } from '@sveltejs/kit';

import { listRepositories } from '$lib/server/harbor';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}

	const project = url.searchParams.get('project');
	if (!project) {
		error(400, 'Query parameter "project" is required');
	}

	try {
		const repositories = await listRepositories(project);
		return json(repositories);
	} catch (err) {
		console.error('Failed to list Harbor repositories:', err);
		error(500, 'Failed to list Harbor repositories');
	}
};

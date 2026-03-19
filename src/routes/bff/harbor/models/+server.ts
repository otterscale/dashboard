import { error, json } from '@sveltejs/kit';

import { listModelArtifacts } from '$lib/server/harbor';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}

	const project = url.searchParams.get('project') || '';
	if (!project) {
		error(400, 'Query parameter "project" is required');
	}

	try {
		const accessToken = locals.session.tokenSet.accessToken;
		const modelArtifacts = await listModelArtifacts(project, accessToken);
		return json(modelArtifacts);
	} catch (err) {
		console.error('Failed to list Harbor model artifacts:', err);
		error(500, 'Failed to list Harbor model artifacts');
	}
};

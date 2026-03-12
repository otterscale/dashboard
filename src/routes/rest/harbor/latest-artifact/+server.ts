import { error, json } from '@sveltejs/kit';

import { getLatestArtifact } from '$lib/server/harbor';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}

	const project = url.searchParams.get('project');
	if (!project) {
		error(400, 'Query parameter "project" is required');
	}

	const repository = url.searchParams.get('repository');
	if (!repository) {
		error(400, 'Query parameter "repository" is required');
	}

	try {
		const accessToken = locals.session.tokenSet.accessToken;
		const artifact = await getLatestArtifact(project, repository, accessToken);
		return json(artifact);
	} catch (err) {
		console.error('Failed to get Harbor latest artifact:', err);
		error(500, 'Failed to get Harbor latest artifact');
	}
};

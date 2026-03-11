import { error, json } from '@sveltejs/kit';

import { getArtifact } from '$lib/server/harbor';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}

	const project = url.searchParams.get('project') || '';
	if (!project) {
		error(400, 'Query parameter "project" is required');
	}

	const repository = url.searchParams.get('repository') || '';
	if (!project) {
		error(400, 'Query parameter "repository" is required');
	}

	try {
		const accessToken = locals.session.tokenSet.accessToken;
		const latestModelArtifact = await getArtifact(project, repository, 'latest', accessToken);
		return json(latestModelArtifact);
	} catch (err) {
		console.error('Failed to get Harbor latest model artifact:', err);
		error(500, 'Failed to get Harbor latest model artifact');
	}
};

import { error, json } from '@sveltejs/kit';

import { listModelArtifacts } from '$lib/server/harbor';

import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}

	try {
		const accessToken = locals.session.tokenSet.accessToken;
		const modelArtifacts = await listModelArtifacts(accessToken);
		return json(modelArtifacts);
	} catch (err) {
		console.error('Failed to list Harbor model artifacts:', err);
		error(500, 'Failed to list Harbor model artifacts');
	}
};

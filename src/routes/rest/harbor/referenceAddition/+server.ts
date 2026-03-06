import { error, json, type RequestHandler } from '@sveltejs/kit';

import { getReferenceAddition } from '$lib/server/harbor';

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

	const reference = url.searchParams.get('reference');
	if (!reference) {
		error(400, 'Query parameter "reference" is required');
	}

	const addition = url.searchParams.get('addition');
	if (!addition) {
		error(400, 'Query parameter "addition" is required');
	}

	try {
		const accessToken = locals.session.tokenSet.accessToken;
		const referenceAddition = await getReferenceAddition(
			project,
			repository,
			reference,
			addition,
			accessToken
		);
		return json(referenceAddition);
	} catch (err) {
		console.error('Failed to get Harbor artifact addition:', err);
		error(500, 'Failed to list Harbor artifact addition');
	}
};

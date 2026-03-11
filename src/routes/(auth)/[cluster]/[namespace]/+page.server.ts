import type { PageServerLoad } from './$types';

const CREATE_PATH = '/otterscale.resource.v1.ResourceService/Create';

export const load: PageServerLoad = async ({ params, fetch, parent, url }) => {
	const { user } = await parent();
	const cluster = params.cluster ?? '';
	const sub = user?.sub;

	if (!cluster || !sub) {
		return { isAdmin: false };
	}

	try {
		const manifestJson = JSON.stringify({
			apiVersion: 'authorization.k8s.io/v1',
			kind: 'SubjectAccessReview',
			spec: {
				resourceAttributes: {
					verb: '*',
					group: '*',
					resource: '*'
				},
				user: sub
			}
		});

		const manifestBytes = new TextEncoder().encode(manifestJson);
		const manifestBase64 =
			typeof Buffer !== 'undefined'
				? Buffer.from(manifestBytes).toString('base64')
				: btoa(String.fromCharCode(...manifestBytes));

		const target = new URL(CREATE_PATH, url.origin).toString();
		const response = await fetch(target, {
			method: 'POST',
			headers: {
				'x-proxy-target': 'api',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				cluster,
				namespace: '',
				group: 'authorization.k8s.io',
				version: 'v1',
				resource: 'subjectaccessreviews',
				manifest: manifestBase64
			})
		});

		if (!response.ok) {
			return { isAdmin: false };
		}

		const data = (await response.json()) as { object?: { status?: { allowed?: boolean } } };
		return { isAdmin: data.object?.status?.allowed ?? false };
	} catch (error) {
		console.error('Failed to verify admin status:', error);
		return { isAdmin: false };
	}
};

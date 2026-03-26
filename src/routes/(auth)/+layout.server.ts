import { redirect } from '@sveltejs/kit';

import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, params, fetch }) => {
	const user = locals.session?.user;
	if (!user) {
		throw redirect(307, '/');
	}

	let isClusterAdmin = false;
	try {
		if (params.cluster && user.sub) {
			isClusterAdmin = await verifyClusterAdminStatus(fetch, params.cluster, user.sub);
		}
	} catch (error) {
		console.error('Failed to verify admin status:', error);
	}

	return { user, isClusterAdmin };
};

async function verifyClusterAdminStatus(
	svelteFetch: typeof fetch,
	cluster: string,
	sub: string
): Promise<boolean> {
	const manifestBase64 = btoa(
		JSON.stringify({
			apiVersion: 'authorization.k8s.io/v1',
			kind: 'SubjectAccessReview',
			spec: {
				resourceAttributes: { verb: '*', group: '*', resource: '*' },
				user: sub
			}
		})
	);
	const response = await svelteFetch('/otterscale.resource.v1.ResourceService/Create', {
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

	if (!response.ok) return false;

	const data = (await response.json()) as { object?: { status?: { allowed?: boolean } } };
	return data.object?.status?.allowed ?? false;
}

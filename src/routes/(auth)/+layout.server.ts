import { redirect } from '@sveltejs/kit';

import { env } from '$env/dynamic/private';

import type { LayoutServerLoad } from './$types';

/**
 * Whether the import-cluster wizard's `curl` needs `-k`.
 *
 * NODE_EXTRA_CA_CERTS is set exactly when this dashboard had to be told about a
 * private CA to reach the otterscale API at all. The values URL the wizard hands
 * out is served by that same API, so the operator's `curl` meets the same
 * certificate — without a bundle to point at, since `helm install -f <url>`
 * accepts no TLS options. It is a real process env var read at Node startup, so
 * it can only be observed here, not from the browser.
 */
const agentValuesInsecureTLS = Boolean(env.NODE_EXTRA_CA_CERTS);

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

	return { user, isClusterAdmin, agentValuesInsecureTLS };
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

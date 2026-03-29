import { error, json, type RequestHandler } from '@sveltejs/kit';
import { load } from 'js-yaml';

import type { IndexChartType } from '$lib/components/artifact-viewer/types';

function getIndexUrl(repositoryUrl: string): URL {
	const url = new URL(repositoryUrl);
	if (url.pathname.endsWith('/index.yaml') || url.pathname.endsWith('/index.yml')) {
		return url;
	}
	if (!url.pathname.endsWith('/')) {
		url.pathname = `${url.pathname}/`;
	}
	return new URL('index.yaml', url);
}

async function fetchSecretAuthorityHeader(
	fetchFn: typeof fetch,
	cluster: string,
	namespace: string,
	secretName: string
): Promise<string> {
	const payload = {
		cluster,
		namespace,
		group: '',
		version: 'v1',
		resource: 'secrets',
		name: secretName
	};

	const secretResponse = await fetchFn('/otterscale.resource.v1.ResourceService/Get', {
		method: 'POST',
		headers: {
			'x-proxy-target': 'api',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});

	if (!secretResponse.ok) {
		const errorText = await secretResponse.text();
		console.error(
			`Secret Response NOT OK: ${secretResponse.status} ${secretResponse.statusText}\nBody: ${errorText}`
		);
		return '';
	}

	const { object: secret } = (await secretResponse.json()) as any;
	if (secret?.type !== 'kubernetes.io/basic-auth' || !secret?.data) return '';

	const username = secret.data.username
		? Buffer.from(secret.data.username, 'base64').toString('utf8')
		: '';
	const password = secret.data.password
		? Buffer.from(secret.data.password, 'base64').toString('utf8')
		: '';

	if (!username && !password) return '';

	return `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`;
}

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	if (!locals.session) {
		throw error(403, 'Unauthorized dashboard session');
	}

	try {
		const body = await request.json();
		const { cluster, namespace, repositoryUrl, secretName } = body as {
			cluster?: string;
			namespace?: string;
			repositoryUrl?: string;
			secretName?: string;
		};

		if (!cluster || !namespace || !repositoryUrl) {
			throw error(400, 'Missing required fields: cluster, namespace, repositoryUrl');
		}

		const authorizationHeader = secretName
			? await fetchSecretAuthorityHeader(fetch, cluster, namespace, secretName)
			: '';
		const indexUrl = getIndexUrl(repositoryUrl);
		const response = await fetch(indexUrl, {
			headers: {
				Accept: 'application/yaml, application/x-yaml, text/yaml, text/plain, */*',
				...(authorizationHeader ? { Authorization: authorizationHeader } : {})
			}
		});

		if (!response.ok) {
			const text = await response.text();
			return new Response(text, { status: response.status });
		}

		const document = load(await response.text()) as {
			entries?: Record<string, IndexChartType[]>;
		};

		const entries = Object.values(document?.entries ?? {}).map((versions) => {
			const [latestVersion] = versions;
			return {
				apiVersion: latestVersion.apiVersion,
				appVersion: latestVersion.appVersion,
				created: latestVersion.created,
				description: latestVersion.description,
				digest: latestVersion.digest,
				home: latestVersion.home,
				icon: latestVersion.icon,
				keywords: latestVersion.keywords,
				maintainers: latestVersion.maintainers,
				name: latestVersion.name,
				type: latestVersion.type,
				version: latestVersion.version,
				urls: latestVersion.urls,
				versions: versions
			};
		});

		return json(entries);
	} catch (err: any) {
		console.error('[helm-repository-index] Failed to fetch repository index:', err);
		throw error(
			err?.status ?? 500,
			`Failed to fetch Helm repository index: ${err?.message || 'Unknown error'}`
		);
	}
};

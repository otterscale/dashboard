import { error, json, type RequestHandler } from '@sveltejs/kit';
import { load } from 'js-yaml';

interface HelmRepositoryIndexEntry {
	name?: string;
	version?: string;
	appVersion?: string;
	created?: string;
	description?: string;
	digest?: string;
	home?: string;
	icon?: string;
	urls?: string[];
	[key: string]: unknown;
}

function normalizeRepositoryUrl(repositoryUrl: string): URL {
	try {
		return new URL(repositoryUrl);
	} catch {
		throw error(400, `Invalid repository URL: ${repositoryUrl}`);
	}
}

function getIndexUrl(repositoryUrl: string): URL {
	const baseUrl = normalizeRepositoryUrl(repositoryUrl);
	if (baseUrl.pathname.endsWith('/index.yaml') || baseUrl.pathname.endsWith('/index.yml')) {
		return baseUrl;
	}
	if (!baseUrl.pathname.endsWith('/')) {
		baseUrl.pathname = `${baseUrl.pathname}/`;
	}
	return new URL('index.yaml', baseUrl);
}

async function fetchSecretAuthHeader(
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
			? await fetchSecretAuthHeader(fetch, cluster, namespace, secretName)
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
			entries?: Record<string, HelmRepositoryIndexEntry[]>;
		};
		const entries = Object.entries(document?.entries ?? {}).flatMap(([chartName, versions]) => {
			const normalizedVersions = (versions ?? [])
				.filter((version): version is HelmRepositoryIndexEntry => Boolean(version?.version))
				.map((version) => ({
					name: String(version.name ?? chartName),
					version: String(version.version),
					appVersion: typeof version.appVersion === 'string' ? version.appVersion : undefined,
					created: typeof version.created === 'string' ? version.created : undefined,
					description: typeof version.description === 'string' ? version.description : undefined,
					digest: typeof version.digest === 'string' ? version.digest : undefined,
					home: typeof version.home === 'string' ? version.home : undefined,
					icon: typeof version.icon === 'string' ? version.icon : undefined,
					urls: Array.isArray(version.urls)
						? version.urls
								.filter((url): url is string => typeof url === 'string')
								.map((url) => new URL(url, indexUrl).toString())
						: [],
					raw: version
				}));

			if (normalizedVersions.length === 0) {
				return [];
			}

			return [
				{
					chartName,
					latest: normalizedVersions[0],
					versions: normalizedVersions
				}
			];
		});

		return json({ entries });
	} catch (err: any) {
		console.error('[helm-repository-index] Failed to fetch repository index:', err);
		throw error(
			err?.status ?? 500,
			`Failed to fetch Helm repository index: ${err?.message || 'Unknown error'}`
		);
	}
};

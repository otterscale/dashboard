import { createClient, type Interceptor } from '@connectrpc/connect';
import { createConnectTransport } from '@connectrpc/connect-web';
import { type GetRequest, ResourceService } from '@otterscale/api/resource/v1';
import { error, json } from '@sveltejs/kit';
import lodash from 'lodash';

import { redis } from '$lib/server/redis';

import type { RequestHandler } from './$types';

const TimeToLiveSeconds = 5 * 60; // 5 minutes cache

export const POST: RequestHandler = async ({ request, locals, fetch }) => {
	console.log('[harbor-proxy] Handling request. Session exists:', !!locals.session);
	if (!locals.session) {
		console.log('[harbor-proxy] Rejecting due to missing session');
		error(403, 'Unauthorized dashboard session');
	}

	try {
		const { cluster, namespace, helmRepositoryName, apiPath } = await request.json();

		if (!cluster || !namespace || !helmRepositoryName || !apiPath) {
			error(400, 'Missing required fields in request body');
		}

		// Prevent returning to parent directories or accessing malicious paths
		if (apiPath.includes('..') || !apiPath.startsWith('/api/')) {
			error(400, 'Invalid apiPath');
		}

		let harborBaseUrl = '';
		let authorizationHeader = '';
		const cacheKey = `harbor_credentials:${cluster}:${namespace}:${helmRepositoryName}`;

		const cachedCredentials = await redis.get(cacheKey);

		if (cachedCredentials) {
			console.log(`[harbor-proxy] Using cached credentials for ${cacheKey}`);
			const cached = JSON.parse(cachedCredentials);
			harborBaseUrl = cached.harborBaseUrl;
			authorizationHeader = cached.authorizationHeader;
		} else {
			const proxyHeaderInterceptor: Interceptor = (next) => async (req) => {
				req.header.set('x-proxy-target', 'api');
				return await next(req);
			};

			const transport = createConnectTransport({
				baseUrl: '',
				interceptors: [proxyHeaderInterceptor],
				fetch
			});
			const resourceClient = createClient(ResourceService, transport);

			// Fetch the HelmRepository
			console.log(`[harbor-proxy] Fetching HelmRepository ${helmRepositoryName}`);
			const repoResponse = await resourceClient.get({
				cluster,
				namespace,
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				resource: 'helmrepositories',
				name: helmRepositoryName
			} as GetRequest);

			const helmRepository = repoResponse.object as any;
			if (!helmRepository) {
				error(404, 'HelmRepository not found');
			}

			// Calculate Harbor Base URL
			const harborUrlSpec = lodash.get(helmRepository, 'spec.url');
			if (!harborUrlSpec) {
				error(500, `HelmRepository "${helmRepositoryName}" missing spec.url`);
			}
			const url = new URL(harborUrlSpec);
			const insecure = lodash.get(helmRepository, 'spec.insecure');
			const protocol = insecure ? 'http' : 'https';
			harborBaseUrl = `${protocol}://${url.host}`;

			// Fetch the basic auth secret from Kubernetes
			const secretRefName = lodash.get(helmRepository, 'spec.secretRef.name', '');

			if (secretRefName) {
				console.log(`[harbor-proxy] Fetching Secret ${secretRefName}`);
				const secretResponse = await resourceClient.get({
					cluster,
					namespace,
					group: '',
					version: 'v1',
					resource: 'secrets',
					name: secretRefName
				} as GetRequest);

				const secret = secretResponse.object as any;
				if (secret?.type === 'kubernetes.io/basic-auth' && secret?.data) {
					const username = secret.data.username ? atob(secret.data.username) : '';
					const password = secret.data.password ? atob(secret.data.password) : '';
					if (username || password) {
						authorizationHeader = `Basic ${btoa(`${username}:${password}`)}`;
					}
				}
			}

			const cacheData = JSON.stringify({
				harborBaseUrl,
				authorizationHeader
			});
			await redis.set(cacheKey, cacheData, 'EX', TimeToLiveSeconds);
		}

		const targetUrl = `${harborBaseUrl}${apiPath}`;

		const headers: Record<string, string> = {
			Accept: 'application/json'
		};

		if (authorizationHeader) {
			headers['Authorization'] = authorizationHeader;
		}

		console.log(`[harbor-proxy] Proxied fetch to: ${targetUrl}`);
		const response = await fetch(targetUrl, { headers });

		if (!response.ok) {
			const text = await response.text();
			console.error(`[harbor-proxy] Error ${response.status}:`, text);
			return new Response(text, { status: response.status });
		}

		const contentType = response.headers.get('content-type') || '';

		if (contentType.includes('application/json')) {
			const data = await response.json();
			return json(data);
		} else {
			const text = await response.text();
			return new Response(text, {
				headers: {
					'Content-Type': contentType
				}
			});
		}
	} catch (err: any) {
		console.error('[harbor-proxy] Failed to proxy request:', err);
		error(500, `Failed to proxy Harbor request: ${err.message || 'Unknown error'}`);
	}
};

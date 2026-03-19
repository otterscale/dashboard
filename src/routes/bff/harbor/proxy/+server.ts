import { error, json } from '@sveltejs/kit';

import { redis } from '$lib/server/redis';

import type { RequestHandler } from './$types';

const TimeToLiveSeconds = 5 * 60; // 5 minutes cache

const REDIS_PREFIX = 'harbor-proxy-secret:';

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
		const errorText = await secretResponse.text();
		console.log(
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
	console.log('[harbor-proxy] Handling request');
	if (!locals.session) {
		console.log('[harbor-proxy] Rejecting due to missing session');
		throw error(403, 'Unauthorized dashboard session');
	}

	try {
		const body = await request.json();

		const { cluster, namespace, harborHost, apiPath, isInternal } = body;
		const { secretName } = body;

		if (!cluster || !namespace || !harborHost || !apiPath) {
			throw error(400, 'Missing required fields: cluster, namespace, harborHost, apiPath');
		}

		let authorizationHeader = '';

		if (isInternal) {
			console.log('[harbor-proxy] Using Keycloak token for internal repository');
			authorizationHeader = `Bearer ${locals.session.tokenSet.accessToken}`;
		} else if (secretName) {
			const cacheKey = `${cluster}/${namespace}/${secretName}`;
			const redisKey = REDIS_PREFIX + cacheKey;
			const cachedSecret = await redis.get(redisKey);

			if (cachedSecret) {
				console.log(`[harbor-proxy] Using cached Secret for ${cacheKey}`);
				authorizationHeader = cachedSecret;
			} else {
				console.log(`[harbor-proxy] Fetching Secret ${secretName}`);
				authorizationHeader = await fetchSecretAuthHeader(fetch, cluster, namespace, secretName);
				if (authorizationHeader) {
					await redis.set(redisKey, authorizationHeader, 'EX', TimeToLiveSeconds);
					console.log(`[harbor-proxy] Cached Secret for ${cacheKey} (TTL: ${TimeToLiveSeconds}s)`);
				}
			}
		}

		const targetUrl = `${harborHost}${apiPath}`;
		console.log(`Proxied fetch to: ${targetUrl}`);

		const getHeaders = (authorization: string): Record<string, string> => {
			const headers: Record<string, string> = { Accept: 'application/json' };
			if (authorization) headers['Authorization'] = authorization;
			return headers;
		};

		let response = await fetch(targetUrl, { headers: getHeaders(authorizationHeader) });

		// If Harbor returns 401 and we have a secret, re-fetch to check for updates
		if (response.status === 401 && secretName) {
			const cacheKey = `${cluster}/${namespace}/${secretName}`;
			const redisKey = REDIS_PREFIX + cacheKey;
			const wasCached = (await redis.get(redisKey)) !== null;

			console.log(`[harbor-proxy] Got 401, re-fetching Secret ${secretName} to check for updates`);
			const freshAuthHeader = await fetchSecretAuthHeader(fetch, cluster, namespace, secretName);

			if (freshAuthHeader && freshAuthHeader !== authorizationHeader) {
				console.log(`[harbor-proxy] Secret changed! Retrying with updated credentials`);
				await redis.set(redisKey, freshAuthHeader, 'EX', TimeToLiveSeconds);
				authorizationHeader = freshAuthHeader;
				response = await fetch(targetUrl, { headers: getHeaders(authorizationHeader) });
			} else if (wasCached) {
				console.log(`[harbor-proxy] Secret unchanged, evicting cache entry for ${cacheKey}`);
				await redis.del(redisKey);
			}
		}

		console.log(`[harbor-proxy] Harbor response status: ${response.status}`);
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
		throw error(500, `Failed to proxy Harbor request: ${err?.message || 'Unknown error'}`);
	}
};

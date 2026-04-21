import { type Handle, type HandleServerError, redirect } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { OAuth2RequestError } from 'arctic';

import { env } from '$env/dynamic/private';
import { paraglideMiddleware } from '$lib/paraglide/server';
import { keycloak } from '$lib/server/keycloak';
import {
	acquireRefreshLock,
	deleteSessionTokenCookie,
	getSessionTokenCookie,
	releaseRefreshLock,
	setSessionTokenCookie,
	updateSessionTokenSet,
	validateSessionToken
} from '$lib/server/session';

const HOP_BY_HOP_HEADERS = [
	'connection',
	'keep-alive',
	'proxy-authenticate',
	'proxy-authorization',
	'te',
	'trailer',
	'transfer-encoding',
	'upgrade'
];

const PROXY_REQUEST_HEADERS_TO_REMOVE = ['cookie', 'host', 'x-proxy-target'];

const PROXY_RESPONSE_HEADERS_TO_REMOVE = ['content-encoding', 'content-length'];

const handleParaglide: Handle = ({ event, resolve }) =>
	paraglideMiddleware(event.request, ({ request, locale }) => {
		event.request = request;

		return resolve(event, {
			transformPageChunk: ({ html }) => html.replace('%paraglide.lang%', locale)
		});
	});

const handleAuth: Handle = async ({ event, resolve }) => {
	const token = getSessionTokenCookie(event.cookies);

	if (!token) {
		event.locals.session = null;
		return resolve(event);
	}

	const { session, fresh } = await validateSessionToken(token);

	if (session) {
		if (fresh) {
			setSessionTokenCookie(event.cookies, token, session.expiresAt);
		}
		event.locals.session = session;
	} else {
		deleteSessionTokenCookie(event.cookies);
		event.locals.session = null;
	}

	return resolve(event);
};

const BUFFER_MS = 60 * 1000;
const REFRESH_LOCK_TTL_MS = 30 * 1000;
const REFRESH_WAIT_POLL_MS = 200;
const REFRESH_WAIT_MAX_MS = 10 * 1000;

const isNearExpiry = (expiresAt: Date): boolean =>
	Date.now() >= (expiresAt.getTime() ?? 0) - BUFFER_MS;

const handleRefreshToken: Handle = async ({ event, resolve }) => {
	const session = event.locals.session;

	if (!session || !isNearExpiry(session.tokenSet.accessTokenExpiresAt)) {
		return resolve(event);
	}

	const token = getSessionTokenCookie(event.cookies);
	if (!token) {
		return resolve(event);
	}

	const hasLock = await acquireRefreshLock(session.id, REFRESH_LOCK_TTL_MS);

	if (!hasLock) {
		// Another request is refreshing — wait briefly for it to finish, then reload from Redis.
		const deadline = Date.now() + REFRESH_WAIT_MAX_MS;
		while (Date.now() < deadline) {
			await new Promise((r) => setTimeout(r, REFRESH_WAIT_POLL_MS));
			const { session: latest } = await validateSessionToken(token);
			if (!latest) break;
			if (!isNearExpiry(latest.tokenSet.accessTokenExpiresAt)) {
				event.locals.session = latest;
				return resolve(event);
			}
		}
		// Fall through: couldn't confirm a refresh; proceed with existing (possibly stale) session.
		return resolve(event);
	}

	try {
		// Re-read after acquiring the lock: another request may have just refreshed,
		// which would have invalidated our in-memory refresh token (single-use).
		const { session: latest } = await validateSessionToken(token);
		if (!latest) {
			deleteSessionTokenCookie(event.cookies);
			event.locals.session = null;
			return resolve(event);
		}

		if (!isNearExpiry(latest.tokenSet.accessTokenExpiresAt)) {
			event.locals.session = latest;
			return resolve(event);
		}

		try {
			const tokens = await keycloak.refreshAccessToken(latest.tokenSet.refreshToken);
			const tokenSet = {
				idToken: tokens.idToken(),
				accessToken: tokens.accessToken(),
				refreshToken: tokens.refreshToken(),
				accessTokenExpiresAt: tokens.accessTokenExpiresAt()
			};

			await updateSessionTokenSet(latest.id, tokenSet);

			latest.tokenSet = tokenSet;
			event.locals.session = latest;
		} catch (err) {
			// Only log the user out when Keycloak explicitly says the refresh token is bad.
			// Transient errors (network, 5xx) should keep the session so the next request can retry.
			if (err instanceof OAuth2RequestError && err.code === 'invalid_grant') {
				console.error('Refresh token rejected by Keycloak:', err);
				deleteSessionTokenCookie(event.cookies);
				event.locals.session = null;
			} else {
				console.error('Token refresh failed (transient):', err);
				event.locals.session = latest;
			}
		}
	} finally {
		await releaseRefreshLock(session.id);
	}

	return resolve(event);
};

const handleGuard: Handle = async ({ event, resolve }) => {
	if (event.locals.session) {
		return resolve(event);
	}

	const isApiProxy = event.request.headers.get('x-proxy-target') === 'api';

	if (isApiProxy) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	const isPrivatePath = event.route.id?.startsWith('/(auth)/');

	if (isPrivatePath) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};

const handleProxy: Handle = async ({ event, resolve }) => {
	const isApiProxy = event.request.headers.get('x-proxy-target') === 'api';
	const session = event.locals.session;

	if (!isApiProxy || !session) {
		return resolve(event);
	}

	if (!env.API_URL) {
		throw new Error('API_URL environment variable is not set');
	}

	const base = new URL(env.API_URL);
	const targetUrl = new URL(
		base.pathname.replace(/\/$/, '') + event.url.pathname + event.url.search,
		base.origin
	);
	const proxyHeaders = new Headers(event.request.headers);

	HOP_BY_HOP_HEADERS.forEach((header) => proxyHeaders.delete(header));
	PROXY_REQUEST_HEADERS_TO_REMOVE.forEach((header) => proxyHeaders.delete(header));

	proxyHeaders.set('Authorization', `Bearer ${session.tokenSet.accessToken}`);

	try {
		const response = await fetch(targetUrl.toString(), {
			method: event.request.method,
			headers: proxyHeaders,
			body: event.request.body,
			duplex: 'half'
		} as RequestInit);

		const responseHeaders = new Headers(response.headers);

		HOP_BY_HOP_HEADERS.forEach((header) => responseHeaders.delete(header));
		PROXY_RESPONSE_HEADERS_TO_REMOVE.forEach((header) => responseHeaders.delete(header));

		return new Response(response.body, {
			headers: responseHeaders,
			status: response.status,
			statusText: response.statusText
		} as ResponseInit);
	} catch (err) {
		console.error('Proxy Fetch Error:', err);
		return new Response(JSON.stringify({ error: 'Bad Gateway', details: 'Upstream unreachable' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};

export const handle: Handle = sequence(
	handleParaglide,
	handleAuth,
	handleRefreshToken,
	handleGuard,
	handleProxy
);

export const handleError: HandleServerError = ({ error, event }) => {
	console.error({
		message: '[Server Error] Uncaught Exception',
		path: event.url.pathname,
		username: event.locals.session?.user.username,
		error
	});
};

import { type Handle, type HandleServerError, redirect, type RequestEvent } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';

import { paraglideMiddleware } from '$lib/paraglide/server';
import { forwardApiRequest } from '$lib/server/proxy';
import { tryRefreshSession } from '$lib/server/refresh';
import {
	deleteSessionTokenCookie,
	getSessionTokenCookie,
	setSessionTokenCookie,
	validateSessionToken
} from '$lib/server/session';

const isApiProxyRequest = (event: RequestEvent): boolean =>
	event.request.headers.get('x-proxy-target') === 'api';

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
		if (fresh) setSessionTokenCookie(event.cookies, token, session.expiresAt);
		event.locals.session = session;
	} else {
		deleteSessionTokenCookie(event.cookies);
		event.locals.session = null;
	}

	return resolve(event);
};

const handleRefreshToken: Handle = async ({ event, resolve }) => {
	await tryRefreshSession(event, false);
	return resolve(event);
};

const handleGuard: Handle = async ({ event, resolve }) => {
	if (event.locals.session) return resolve(event);

	if (isApiProxyRequest(event)) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}

	if (event.route.id?.startsWith('/(auth)/')) {
		throw redirect(303, '/login');
	}

	return resolve(event);
};

const handleProxy: Handle = async ({ event, resolve }) => {
	const session = event.locals.session;
	if (!isApiProxyRequest(event) || !session) return resolve(event);
	return forwardApiRequest(event, session);
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

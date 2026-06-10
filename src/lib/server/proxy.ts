import type { RequestEvent } from '@sveltejs/kit';

import { env } from '$env/dynamic/private';

import { tryRefreshSession } from './refresh';
import type { Session } from './session';

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

const REQUEST_HEADERS_TO_REMOVE = ['cookie', 'host', 'x-proxy-target'];
const RESPONSE_HEADERS_TO_REMOVE = ['content-encoding', 'content-length'];
const IDEMPOTENT_RETRY_METHODS = new Set(['GET', 'HEAD']);

function buildTargetUrl(event: RequestEvent): URL {
	if (!env.API_URL) throw new Error('API_URL environment variable is not set');
	const base = new URL(env.API_URL);
	return new URL(
		base.pathname.replace(/\/$/, '') + event.url.pathname + event.url.search,
		base.origin
	);
}

function stripHeaders(headers: Headers, names: string[]): void {
	for (const name of names) headers.delete(name);
}

function buildRequestHeaders(event: RequestEvent): Headers {
	const headers = new Headers(event.request.headers);
	stripHeaders(headers, HOP_BY_HOP_HEADERS);
	stripHeaders(headers, REQUEST_HEADERS_TO_REMOVE);
	return headers;
}

function buildResponseHeaders(upstream: Response): Headers {
	const headers = new Headers(upstream.headers);
	stripHeaders(headers, HOP_BY_HOP_HEADERS);
	stripHeaders(headers, RESPONSE_HEADERS_TO_REMOVE);
	return headers;
}

export async function forwardApiRequest(event: RequestEvent, session: Session): Promise<Response> {
	const targetUrl = buildTargetUrl(event);
	const method = event.request.method;
	const canRetryOn401 = IDEMPOTENT_RETRY_METHODS.has(method);
	const baseHeaders = buildRequestHeaders(event);

	const sendUpstream = (accessToken: string): Promise<Response> => {
		const headers = new Headers(baseHeaders);
		headers.set('Authorization', `Bearer ${accessToken}`);
		return fetch(targetUrl.toString(), {
			method,
			headers,
			// Body is a stream that can only be read once. Retry paths (GET/HEAD)
			// have no body; other methods forward the stream directly.
			body: canRetryOn401 ? undefined : event.request.body,
			signal: event.request.signal,
			duplex: 'half'
		} as RequestInit);
	};

	try {
		let response = await sendUpstream(session.tokenSet.accessToken);

		// Upstream rejected our token — force a refresh and retry once.
		if (response.status === 401 && canRetryOn401) {
			await response.body?.cancel().catch(() => {});
			const outcome = await tryRefreshSession(event, true);
			if (outcome.kind === 'ok') {
				response = await sendUpstream(outcome.session.tokenSet.accessToken);
			}
			// 'invalid' → session was cleared; let the 401 propagate so the client re-logs in.
			// 'transient' → nothing we can do; let the 401 propagate.
		}

		return new Response(response.body, {
			headers: buildResponseHeaders(response),
			status: response.status,
			statusText: response.statusText
		} as ResponseInit);
	} catch (err) {
		// Client disconnects surface as AbortError — return 499 (client closed request).
		if (err instanceof Error && err.name === 'AbortError') {
			return new Response(null, { status: 499 });
		}
		console.error('Proxy Fetch Error:', err);
		return new Response(JSON.stringify({ error: 'Bad Gateway', details: 'Upstream unreachable' }), {
			status: 502,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}

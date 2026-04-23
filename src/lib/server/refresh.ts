import type { RequestEvent } from '@sveltejs/kit';
import { OAuth2RequestError } from 'arctic';

import { keycloak } from './keycloak';
import {
	acquireRefreshLock,
	deleteSessionTokenCookie,
	getSessionTokenCookie,
	invalidateSession,
	releaseRefreshLock,
	type Session,
	updateSessionTokenSet,
	validateSessionToken
} from './session';

const BUFFER_MS = 60 * 1000;
const LOCK_TTL_MS = 30 * 1000;
const WAIT_POLL_MS = 200;
const WAIT_MAX_MS = 10 * 1000;

export type RefreshOutcome =
	| { kind: 'ok'; session: Session }
	| { kind: 'invalid' } // refresh token rejected — caller should treat as logout
	| { kind: 'transient' }; // network/5xx — keep existing session, retry later

const isNearExpiry = (expiresAt: Date): boolean => Date.now() >= expiresAt.getTime() - BUFFER_MS;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function clearSession(event: RequestEvent): void {
	deleteSessionTokenCookie(event.cookies);
	event.locals.session = null;
}

/**
 * Another request holds the refresh lock. Poll Redis until we see fresh tokens
 * or we give up.
 */
async function waitForOngoingRefresh(event: RequestEvent, token: string): Promise<RefreshOutcome> {
	const deadline = Date.now() + WAIT_MAX_MS;
	while (Date.now() < deadline) {
		await sleep(WAIT_POLL_MS);
		const { session: latest } = await validateSessionToken(token);
		if (!latest) {
			clearSession(event);
			return { kind: 'invalid' };
		}
		if (!isNearExpiry(latest.tokenSet.accessTokenExpiresAt)) {
			event.locals.session = latest;
			return { kind: 'ok', session: latest };
		}
	}
	return { kind: 'transient' };
}

async function performRefresh(event: RequestEvent, latest: Session): Promise<RefreshOutcome> {
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
		return { kind: 'ok', session: latest };
	} catch (err) {
		if (err instanceof OAuth2RequestError && err.code === 'invalid_grant') {
			console.error('Refresh token rejected by Keycloak:', err);
			await invalidateSession(latest.id);
			clearSession(event);
			return { kind: 'invalid' };
		}
		// Transient (network / 5xx): keep the session so the next request can retry.
		console.error('Token refresh failed (transient):', err);
		return { kind: 'transient' };
	}
}

/**
 * Ensures event.locals.session has a usable access token.
 * - `force: false` → only refresh when near-expiry (scheduled refresh).
 * - `force: true`  → always attempt refresh (used after an upstream 401).
 * Handles the single-use refresh-token race via Redis lock + re-read.
 */
export async function tryRefreshSession(
	event: RequestEvent,
	force: boolean
): Promise<RefreshOutcome> {
	const session = event.locals.session;
	if (!session) return { kind: 'invalid' };

	if (!force && !isNearExpiry(session.tokenSet.accessTokenExpiresAt)) {
		return { kind: 'ok', session };
	}

	const token = getSessionTokenCookie(event.cookies);
	if (!token) return { kind: 'invalid' };

	const lockToken = await acquireRefreshLock(session.id, LOCK_TTL_MS);
	if (!lockToken) {
		return waitForOngoingRefresh(event, token);
	}

	try {
		// Re-read after acquiring the lock: another request may have just refreshed,
		// which would have invalidated our in-memory refresh token (single-use).
		const { session: latest } = await validateSessionToken(token);
		if (!latest) {
			clearSession(event);
			return { kind: 'invalid' };
		}
		if (!force && !isNearExpiry(latest.tokenSet.accessTokenExpiresAt)) {
			event.locals.session = latest;
			return { kind: 'ok', session: latest };
		}
		return performRefresh(event, latest);
	} finally {
		await releaseRefreshLock(session.id, lockToken);
	}
}

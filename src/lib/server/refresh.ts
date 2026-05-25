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
 * Another request — possibly on another replica — holds the refresh lock. Poll
 * Redis until the stored refresh token rotates away from `staleRefreshToken`,
 * which proves the in-flight refresh has committed its new token set.
 *
 * We key off the refresh token rather than the access-token expiry on purpose:
 * a short access-token lifespan can make even a freshly minted token look
 * near-expiry, which would hide a completed refresh.
 */
async function waitForOngoingRefresh(
	event: RequestEvent,
	token: string,
	staleRefreshToken: string
): Promise<RefreshOutcome> {
	const deadline = Date.now() + WAIT_MAX_MS;
	while (Date.now() < deadline) {
		await sleep(WAIT_POLL_MS);
		const { session: latest } = await validateSessionToken(token);
		if (!latest) {
			clearSession(event);
			return { kind: 'invalid' };
		}
		if (latest.tokenSet.refreshToken !== staleRefreshToken) {
			event.locals.session = latest;
			return { kind: 'ok', session: latest };
		}
	}
	return { kind: 'transient' };
}

async function performRefresh(event: RequestEvent, latest: Session): Promise<RefreshOutcome> {
	let tokens: Awaited<ReturnType<typeof keycloak.refreshAccessToken>>;
	try {
		tokens = await keycloak.refreshAccessToken(latest.tokenSet.refreshToken);
	} catch (err) {
		if (err instanceof OAuth2RequestError && err.code === 'invalid_grant') {
			console.error('Refresh token rejected by Keycloak:', err);
			await invalidateSession(latest.id);
			clearSession(event);
			return { kind: 'invalid' };
		}
		// Network/5xx: refresh token was not consumed, safe to retry next request.
		console.error('Token refresh failed (transient):', err);
		return { kind: 'transient' };
	}

	const tokenSet = {
		idToken: tokens.idToken(),
		accessToken: tokens.accessToken(),
		refreshToken: tokens.refreshToken(),
		accessTokenExpiresAt: tokens.accessTokenExpiresAt()
	};

	try {
		await updateSessionTokenSet(latest.id, tokenSet);
	} catch (err) {
		// Keycloak has already rotated the refresh token — the old one is dead and
		// the new one only exists in this in-memory `tokenSet`. If we returned ok
		// without persisting, the next request would read the stale token from
		// Redis and trip reuse detection, destroying the session. Invalidate now
		// so the user re-logs in cleanly. (invalidateSession may also fail if
		// Redis is down; the stale session will then self-heal on the next
		// refresh attempt via Keycloak's invalid_grant.)
		console.error('Failed to persist refreshed token set; invalidating session:', err);
		await invalidateSession(latest.id).catch((delErr) => {
			console.error('Failed to invalidate session after persist failure:', delErr);
		});
		clearSession(event);
		return { kind: 'invalid' };
	}

	latest.tokenSet = tokenSet;
	event.locals.session = latest;
	return { kind: 'ok', session: latest };
}

/**
 * Ensures event.locals.session has a usable access token.
 * - `force: false` → only refresh when near-expiry (scheduled refresh).
 * - `force: true`  → refresh even when not near-expiry (used after an upstream 401).
 *
 * Keycloak refresh tokens are single-use: presenting one twice trips reuse
 * detection and revokes the entire SSO session. Two mechanisms — both living in
 * shared Redis, so they hold across replicas — keep concurrent requests from
 * doing that:
 *  1. `acquireRefreshLock` serialises refreshes per session.
 *  2. The rotation guard below only sends a refresh token to Keycloak while
 *     Redis still holds that exact token. If a concurrent request (or replica)
 *     already rotated it, we adopt their result instead of replaying a spent
 *     token.
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

	// The refresh token we intend to rotate away from. It must never be handed
	// to Keycloak more than once, here or on any other replica.
	const staleRefreshToken = session.tokenSet.refreshToken;

	const lockToken = await acquireRefreshLock(session.id, LOCK_TTL_MS);
	if (!lockToken) {
		return waitForOngoingRefresh(event, token, staleRefreshToken);
	}

	try {
		// Re-read under the lock: a concurrent request may have refreshed while we
		// waited to acquire it, which would have consumed our refresh token.
		const { session: latest } = await validateSessionToken(token);
		if (!latest) {
			clearSession(event);
			return { kind: 'invalid' };
		}

		// Rotation guard: the stored refresh token already changed, so another
		// request completed a refresh. Adopt it — replaying staleRefreshToken now
		// would trip Keycloak's reuse detection.
		if (latest.tokenSet.refreshToken !== staleRefreshToken) {
			event.locals.session = latest;
			return { kind: 'ok', session: latest };
		}

		return await performRefresh(event, latest);
	} finally {
		await releaseRefreshLock(session.id, lockToken);
	}
}

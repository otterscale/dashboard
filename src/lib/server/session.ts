import { sha256 } from '@oslojs/crypto/sha2';
import { encodeBase32LowerCaseNoPadding, encodeHexLowerCase } from '@oslojs/encoding';
import type { Cookies } from '@sveltejs/kit';

import { env } from '$env/dynamic/public';

import { redis } from './redis';

const SESSION_EXPIRY_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const SESSION_REFRESH_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 15; // 15 days

export async function acquireRefreshLock(
	sessionId: string,
	ttlMs: number
): Promise<string | null> {
	const token = encodeHexLowerCase(crypto.getRandomValues(new Uint8Array(16)));
	const result = await redis.set(`refresh_lock:${sessionId}`, token, 'PX', ttlMs, 'NX');
	return result === 'OK' ? token : null;
}

// Compare-and-delete: only remove the lock if we still own it, so an expired lock
// taken over by another request is not mistakenly released by us.
const RELEASE_LOCK_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
	return redis.call("del", KEYS[1])
else
	return 0
end
`;

export async function releaseRefreshLock(sessionId: string, token: string): Promise<void> {
	await redis.eval(RELEASE_LOCK_SCRIPT, 1, `refresh_lock:${sessionId}`, token);
}

export function generateSessionToken(): string {
	const bytes = new Uint8Array(20);
	crypto.getRandomValues(bytes);
	return encodeBase32LowerCaseNoPadding(bytes);
}

export async function createSession(
	token: string,
	user: User,
	tokenSet: TokenSet
): Promise<Session> {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));

	const session: Session = {
		id: sessionId,
		user,
		tokenSet,
		expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS)
	};

	await setSessionToRedis(session);

	return session;
}

export async function updateSessionTokenSet(sessionId: string, tokenSet: TokenSet) {
	await redis.hset(`session:${sessionId}`, {
		tokenSet: JSON.stringify(tokenSet)
	});
}

export async function validateSessionToken(
	token: string
): Promise<{ session: Session | null; fresh: boolean }> {
	const sessionId = encodeHexLowerCase(sha256(new TextEncoder().encode(token)));
	const session = await getSessionFromRedis(sessionId);

	if (session === null) {
		return { session: null, fresh: false };
	}

	if (Date.now() >= session.expiresAt.getTime()) {
		await redis.del(`session:${sessionId}`);
		return { session: null, fresh: false };
	}

	if (Date.now() >= session.expiresAt.getTime() - SESSION_REFRESH_THRESHOLD_MS) {
		session.expiresAt = new Date(Date.now() + SESSION_EXPIRY_MS);
		// Only touch the expiresAt field + key TTL; rewriting the whole hash would
		// race with concurrent updateSessionTokenSet calls and could clobber freshly
		// refreshed tokens.
		const pipeline = redis.pipeline();
		pipeline.hset(`session:${sessionId}`, {
			expiresAt: session.expiresAt.getTime().toString()
		});
		pipeline.expireat(`session:${sessionId}`, Math.floor(session.expiresAt.getTime() / 1000));
		await pipeline.exec();
		return { session: session, fresh: true };
	}

	return { session: session, fresh: false };
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await redis.del(`session:${sessionId}`);
}

async function setSessionToRedis(session: Session) {
	const pipeline = redis.pipeline();
	pipeline.hset(`session:${session.id}`, {
		user: JSON.stringify(session.user),
		tokenSet: JSON.stringify(session.tokenSet),
		expiresAt: session.expiresAt.getTime().toString()
	});
	pipeline.expireat(`session:${session.id}`, Math.floor(session.expiresAt.getTime() / 1000));
	await pipeline.exec();
}

async function getSessionFromRedis(sessionId: string): Promise<Session | null> {
	const data = await redis.hgetall(`session:${sessionId}`);
	if (!data || Object.keys(data).length === 0) {
		return null;
	}

	try {
		const user = JSON.parse(data.user);
		const tokenSet = JSON.parse(data.tokenSet);
		tokenSet.accessTokenExpiresAt = new Date(tokenSet.accessTokenExpiresAt);
		const expiresAt = new Date(parseInt(data.expiresAt));

		return { id: sessionId, user, tokenSet, expiresAt };
	} catch {
		await invalidateSession(sessionId);
		return null;
	}
}

export function getSessionTokenCookie(cookies: Cookies): string | undefined {
	return cookies.get(cookieName());
}

export function setSessionTokenCookie(cookies: Cookies, token: string, expiresAt: Date): void {
	cookies.set(cookieName(), token, {
		expires: expiresAt,
		httpOnly: true,
		path: '/',
		sameSite: 'lax' as const,
		secure: isSecure()
	});
}

export function deleteSessionTokenCookie(cookies: Cookies): void {
	cookies.set(cookieName(), '', {
		httpOnly: true,
		maxAge: 0,
		path: '/',
		sameSite: 'lax' as const,
		secure: isSecure()
	});
}

export function isSecure(): boolean {
	return env.PUBLIC_WEB_URL?.startsWith('https') ?? false;
}

function cookieName(): string {
	return isSecure() ? '__Host-OS_SESSION' : 'OS_SESSION';
}

// Types
export type Session = {
	id: string;
	user: User;
	tokenSet: TokenSet;
	expiresAt: Date;
};

export type User = {
	sub: string;
	username: string;
	name: string;
	email: string;
	picture: string;
	roles: string[];
};

export type TokenSet = {
	idToken: string;
	accessToken: string;
	refreshToken: string;
	accessTokenExpiresAt: Date;
};

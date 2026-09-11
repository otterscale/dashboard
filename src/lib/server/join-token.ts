/**
 * Issues a cluster's join token through the otterscale API.
 *
 * Called over Connect's JSON protocol rather than a generated client: the
 * dashboard's `@otterscale/api` package is published separately from the
 * server, so a generated client would make this feature wait on a release.
 * Mirrors routes/(auth)/console/+page.server.ts's ListLinks.
 */

/** Must track LinkService in otterscale/proto/link/v1/link.proto. */
const ISSUE_JOIN_TOKEN_PROCEDURE = '/otterscale.link.v1.LinkService/IssueJoinToken';

/** Connect's JSON error codes, so the wizard can say "not an admin" instead of a generic error. */
const CONNECT_CODE_PERMISSION_DENIED = 'permission_denied';
const CONNECT_CODE_UNAUTHENTICATED = 'unauthenticated';

export class JoinTokenError extends Error {
	/** HTTP status to fail the wizard's request with. */
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = 'JoinTokenError';
		this.status = status;
	}
}

/**
 * Issues the join token for `cluster`.
 *
 * `fetcher` must be the request event's own fetch, so the call routes through
 * hooks.server.ts's handleProxy and picks up the user's access token.
 */
export async function issueJoinToken(
	fetcher: typeof globalThis.fetch,
	cluster: string
): Promise<string> {
	let response: Response;
	try {
		response = await fetcher(ISSUE_JOIN_TOKEN_PROCEDURE, {
			method: 'POST',
			headers: {
				'x-proxy-target': 'api',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({ cluster })
		});
	} catch (err) {
		throw new JoinTokenError(
			`Could not reach the otterscale API to issue a join token: ${err instanceof Error ? err.message : String(err)}`,
			502
		);
	}

	if (!response.ok) {
		const { code, message } = await connectError(response);

		// 403, not 502: the route already checked this role, so seeing one here means the two disagree.
		if (code === CONNECT_CODE_PERMISSION_DENIED || code === CONNECT_CODE_UNAUTHENTICATED) {
			throw new JoinTokenError(`The otterscale API refused to issue a join token: ${message}`, 403);
		}
		throw new JoinTokenError(`Failed to issue a join token (${response.status}): ${message}`, 502);
	}

	const body = (await response.json().catch(() => ({}))) as { joinToken?: string };
	if (!body.joinToken) {
		throw new JoinTokenError('The otterscale API returned an empty join token', 502);
	}
	return body.joinToken;
}

/** Reads Connect's JSON error body, falling back to raw text for non-Connect failures. */
async function connectError(response: Response): Promise<{ code: string; message: string }> {
	const text = await response.text().catch(() => '');
	try {
		const parsed = JSON.parse(text) as { code?: string; message?: string; error?: string };
		return {
			code: parsed.code ?? '',
			message: parsed.message ?? parsed.error ?? text.slice(0, 512)
		};
	} catch {
		return { code: '', message: text.slice(0, 512) || response.statusText };
	}
}

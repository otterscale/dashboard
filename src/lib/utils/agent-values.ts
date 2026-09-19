/**
 * Issues a joining cluster's agent values through the otterscale API.
 *
 * Called over Connect's JSON protocol rather than the generated client:
 * `@otterscale/api` is published separately from the server and its current
 * release (1.4.1) predates `IssueAgentValues`, so going through `createClient`
 * would make this wizard wait on a package release. Swap this for
 * `linkClient.issueAgentValues(...)` once the package carries the procedure.
 *
 * The request routes through hooks.server.ts's handleProxy on the strength of
 * the `x-proxy-target` header, which is what attaches the signed-in user's
 * access token. Nothing is decided here: the procedure is admin-only on the
 * API, and it owns the join token, the Harbor robot and the rendered values.
 */

/** Must track LinkService in otterscale/proto/link/v1/link.proto. */
const ISSUE_AGENT_VALUES_PROCEDURE = '/otterscale.link.v1.LinkService/IssueAgentValues';

/**
 * Carries the API's own wording, which the wizard shows as-is: "caller is not a
 * member of the admin group", or a named invalid field, says more than anything
 * this side could substitute for it.
 */
export class AgentValuesError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AgentValuesError';
	}
}

/** The facts only the operator knows, as AgentClusterInfo in the proto. */
export interface AgentClusterInfo {
	/** Bare host or IP: no scheme, no port. */
	externalAddress: string;
	/** One "<low>-<high>" string, which is what the API and the chart both want. */
	nodePortRange: string;
	/** Absolute http(s) URL, or empty. */
	inferenceUrl: string;
}

export interface IssueAgentValuesRequest {
	cluster: string;
	/** Keycloak subjects bound to cluster-admin alongside the caller, who is always included. */
	extraUsers: string[];
	clusterInfo: AgentClusterInfo;
}

export interface IssuedAgentValues {
	/** The otterscale-agent-flux version the values were rendered for, for `helm install --version`. */
	version: string;
	/** The rendered values file. */
	values: string;
	/** The same bytes behind a URL. The URL is itself the credential authorizing the fetch. */
	url: string;
	/** When `url` stops being served. Null if the API sent no timestamp. */
	expiresAt: Date | null;
}

/** The proto3 JSON shape of IssueAgentValuesResponse. */
interface AgentValuesResponseBody {
	version?: string;
	values?: string;
	url?: string;
	/** Timestamp, so RFC 3339 over JSON. */
	urlExpiresAt?: string;
}

export async function issueAgentValues(
	request: IssueAgentValuesRequest
): Promise<IssuedAgentValues> {
	let response: Response;
	try {
		response = await fetch(ISSUE_AGENT_VALUES_PROCEDURE, {
			method: 'POST',
			headers: {
				'x-proxy-target': 'api',
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(request)
		});
	} catch (err) {
		throw new AgentValuesError(
			`Could not reach the otterscale API: ${err instanceof Error ? err.message : String(err)}`
		);
	}

	if (!response.ok) {
		throw new AgentValuesError(await connectErrorMessage(response));
	}

	const body = (await response.json()) as AgentValuesResponseBody;
	if (!body.url) {
		throw new AgentValuesError('The otterscale API returned no values URL');
	}

	// An unparseable timestamp is treated as absent: the URL still works, and the
	// expiry is only shown as a note.
	const expiresAt = body.urlExpiresAt ? new Date(body.urlExpiresAt) : null;

	return {
		version: body.version ?? '',
		values: body.values ?? '',
		url: body.url,
		expiresAt: expiresAt && !Number.isNaN(expiresAt.getTime()) ? expiresAt : null
	};
}

/**
 * Reads the message out of Connect's JSON error envelope. A body that isn't one
 * at all — a proxy's HTML error page, or hooks.server.ts's own 401 for a session
 * that expired mid-wizard — still has to produce something sayable, so the
 * status line stands in.
 */
async function connectErrorMessage(response: Response): Promise<string> {
	const fallback = `The otterscale API returned ${response.status} ${response.statusText}`.trim();
	try {
		const body = (await response.json()) as { message?: string; error?: string };
		return body.message || body.error || fallback;
	} catch {
		return fallback;
	}
}

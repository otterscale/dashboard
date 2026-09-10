import { stringify } from 'yaml';

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/** Pinned by the agent chart's own validate.yaml while tenantOperator is enabled. */
const AGENT_NAMESPACE = 'otterscale-system';

/** Same as the chart name, so the chart's fullname helper doesn't double it up. */
const AGENT_RELEASE = 'otterscale-agent';

/**
 * Facts about this project, not configuration — a chart value would just be
 * a second place to disagree. The chart is pulled straight from the OCI
 * registry, so the reference is the full `oci://…/otterscale-agent` path.
 */
const AGENT_CHART_REF = 'oci://ghcr.io/otterscale/helm-charts/otterscale-agent';

/**
 * Toggle for whether agent.serverURL is served by a private CA the agent must be
 * told to trust: set it (to "otterscale-ca") to make the wizard emit a
 * `trustedCA` block, leave it unset under a public CA. Only the presence is read
 * — the agent chart's validate.yaml pins both the Secret name and key while
 * tenantOperator is enabled (which the wizard always does), so those are the
 * constants below, and a different value is rejected rather than emitted. The
 * Secret itself is provisioned on the target cluster out of band; the chart only
 * references it by name.
 */
const TRUSTED_CA_ENV = 'AGENT_TRUSTED_CA_SECRET_NAME';

/** Pinned by the agent chart (validate.yaml / deployment.yaml); not configurable there. */
const TRUSTED_CA_SECRET = 'otterscale-ca';
const TRUSTED_CA_KEY = 'ca.crt';

/** Not EOF: the generated values below can't plausibly contain this line. */
const VALUES_DELIMITER = 'VALUES';

export interface ClusterInfoInput {
	enabled: boolean;
	externalAddress: string;
	nodePortRangeMin: number;
	nodePortRangeMax: number;
	inferenceURL?: string;
}

export interface AgentInstallInput {
	cluster: string;
	/** Keycloak subjects granted cluster-admin, the caller's own included. */
	clusterAdminUsers: string[];
	/** From issueJoinToken. Authorizes the agent to register `cluster`. */
	joinToken: string;
	clusterInfo: ClusterInfoInput;
	harborRobotName: string;
	harborRobotSecret: string;
}

export interface AgentInstallCommands {
	installCommand: string;
}

function required(name: string): string {
	const value = env[name];
	if (!value) {
		throw new Error(`${name} is not configured; the otterscale chart sets it on the dashboard`);
	}
	return value;
}

/** PUBLIC_ vars are filtered out of $env/dynamic/private, so read the public side. */
function requiredPublic(name: `PUBLIC_${string}`): string {
	const value = publicEnv[name];
	if (!value) {
		throw new Error(`${name} is not configured; the otterscale chart sets it on the dashboard`);
	}
	return value.replace(/\/$/, '');
}

/** Trailing slash matters: the HTTPRoute's PathPrefix /api/ rule doesn't match a bare /api. */
function agentServerURL(): string {
	return `${requiredPublic('PUBLIC_WEB_URL')}/api/`;
}

/** Mirrors core.ValidateClusterName (otterscale/internal/core/link.go). */
export function validateClusterName(cluster: string): string | null {
	if (!cluster) return 'must not be empty';
	if (cluster.length > 63) return 'must not exceed 63 characters';
	if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(cluster)) {
		return 'must match [a-z0-9]([a-z0-9-]*[a-z0-9])?';
	}
	return null;
}

function buildValues(input: AgentInstallInput): Record<string, unknown> {
	const values: Record<string, unknown> = {
		agent: {
			serverURL: agentServerURL(),
			tunnelServerURL: required('AGENT_TUNNEL_SERVER_URL'),
			cluster: input.cluster
			// joinToken is supplied via --set-string instead, to keep it out of the preview pane.
		},
		clusterAdmin: {
			enabled: input.clusterAdminUsers.length > 0,
			users: input.clusterAdminUsers
		},
		clusterInfo: input.clusterInfo.enabled
			? {
					enabled: true,
					externalAddress: input.clusterInfo.externalAddress,
					// The chart's own contract (otterscale-agent values.yaml) wants a single
					// "min-max" string; the wizard and endpoint carry min/max separately only so
					// "min < max" is a JSON Schema rule. This is the one place they get joined
					// back into that string.
					nodePortRange: `${input.clusterInfo.nodePortRangeMin}-${input.clusterInfo.nodePortRangeMax}`,
					...(input.clusterInfo.inferenceURL
						? { inferenceURL: input.clusterInfo.inferenceURL }
						: {})
				}
			: { enabled: false },
		tenantOperator: {
			enabled: true,
			harbor: {
				url: requiredPublic('PUBLIC_HARBOR_URL'),
				robot: {
					name: input.harborRobotName,
					secret: input.harborRobotSecret
				}
			}
		}
	};

	// Presence is the toggle; the name/key are the chart's to pin. A non-empty
	// value that isn't the pinned name is a misconfiguration — fail here rather
	// than emit a command `helm` rejects at template time. Omitted entirely under
	// a public CA, where the agent needs no extra trust.
	const caToggle = env[TRUSTED_CA_ENV];
	if (caToggle) {
		if (caToggle !== TRUSTED_CA_SECRET) {
			throw new Error(
				`${TRUSTED_CA_ENV} must be "${TRUSTED_CA_SECRET}" or unset: the agent chart pins the trusted-CA Secret name while tenantOperator is enabled`
			);
		}
		values.trustedCA = { secretName: TRUSTED_CA_SECRET, key: TRUSTED_CA_KEY };
	}

	return values;
}

export function buildAgentInstallCommands(input: AgentInstallInput): AgentInstallCommands {
	const invalid = validateClusterName(input.cluster);
	if (invalid) {
		throw new Error(`cluster name ${invalid}`);
	}

	if (!input.joinToken) {
		throw new Error('join token must not be empty');
	}

	const values = stringify(buildValues(input), { lineWidth: 0 });

	const installCommand = [
		`helm upgrade --install ${AGENT_RELEASE} ${AGENT_CHART_REF} \\`,
		`  --namespace ${AGENT_NAMESPACE} \\`,
		`  --create-namespace \\`,
		// On the command line, not in the YAML, so the token stays out of the preview pane.
		`  --set-string agent.joinToken="${input.joinToken}" \\`,
		`  --values - <<'${VALUES_DELIMITER}'`,
		// Quoted delimiter: unquoted, the shell would expand Harbor's robot$<name>.
		values.trimEnd(),
		VALUES_DELIMITER
	].join('\n');

	return { installCommand };
}

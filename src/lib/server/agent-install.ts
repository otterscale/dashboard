import { stringify } from 'yaml';

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/** Namespace the wrapper chart releases into; also where Flux's own release ends up. */
const AGENT_NAMESPACE = 'otterscale-system';

/**
 * The wrapper chart. It creates one HelmRelease each for the agent and Flux, so
 * its own release name only needs to stay clear of theirs (`otterscale-agent`,
 * `flux`) in this namespace.
 */
const AGENT_FLUX_RELEASE = 'otterscale-agent-flux';
const AGENT_FLUX_CHART_REF = 'oci://ghcr.io/otterscale/helm-charts/otterscale-agent-flux';

/**
 * Must match the wrapper's Flux HelmRelease name/namespace exactly: helm-controller
 * only takes over an existing release under its exact name and storage namespace,
 * otherwise it's a second install of the same resources, which fails.
 */
const FLUX_RELEASE = 'flux';
const FLUX_CHART_REF = 'oci://ghcr.io/otterscale/helm-charts/flux';

/**
 * Optional operator-managed ConfigMap (key `values.yaml`) for non-secret
 * overrides on top of the agent's own values — e.g. pointing `image.repository`/
 * `tag` at a mirror registry. Provisioned out of band, like the private-CA Secret.
 *
 * The join token and Harbor robot secret are inlined into `spec.values` rather
 * than going through their own Secret — simpler, at the cost of being readable
 * by anyone who can get helmreleases here, and landing in Flux's logs/backups.
 */
const AGENT_VALUES_NAME = 'otterscale-agent-values';
const AGENT_VALUES_KEY = 'values.yaml';

/** Same optional-override convention as every module HelmRelease; skipped when absent. */
const FLUX_VALUES_NAME = `${FLUX_RELEASE}-values`;
const FLUX_VALUES_KEY = 'values.yaml';

/**
 * Set (to "otterscale-ca") when agent.serverURL sits behind a private CA the agent
 * must trust; unset under a public CA. Only presence is read — name/key are pinned
 * by the agent chart's validate.yaml, so any other value is rejected. The Secret
 * itself is provisioned on the target cluster out of band.
 */
const TRUSTED_CA_ENV = 'AGENT_TRUSTED_CA_SECRET_NAME';

/** Pinned by the agent chart (validate.yaml / deployment.yaml); not configurable there. */
const TRUSTED_CA_SECRET = 'otterscale-ca';
const TRUSTED_CA_KEY = 'ca.crt';

/** Not EOF: the generated values document below can't plausibly contain this line. */
const VALUES_DELIMITER = 'EOF';

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

/** Two blocks, to be run in this order. */
export interface AgentInstallCommands {
	/** Bootstraps Flux; runs before the wrapper, which hands this release over to Flux itself. */
	fluxCommand: string;
	/** Installs the wrapper, which creates the agent's and Flux's HelmReleases. */
	agentCommand: string;
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

/** The agent values, passed through the wrapper's `agent.values`. */
function buildAgentValues(input: AgentInstallInput): Record<string, unknown> {
	const values: Record<string, unknown> = {
		agent: {
			serverURL: agentServerURL(),
			tunnelServerURL: required('AGENT_TUNNEL_SERVER_URL'),
			cluster: input.cluster,
			joinToken: input.joinToken
		},
		clusterAdmin: {
			enabled: input.clusterAdminUsers.length > 0,
			users: input.clusterAdminUsers
		},
		clusterInfo: input.clusterInfo.enabled
			? {
					enabled: true,
					externalAddress: input.clusterInfo.externalAddress,
					// The chart wants one "min-max" string; kept apart on the wizard/endpoint
					// side only so "min < max" can be a schema rule.
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

	// Presence is the toggle; a value other than the chart's pinned name is a
	// misconfiguration, so fail here instead of at template time.
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

/**
 * The wrapper's own values: the agent's values (credentials included) and an
 * optional override ConfigMap for each of the agent and Flux. No `repository`:
 * absent, the chart's own default wins.
 *
 * No `agent.version`/`flux.version`: empty pins each chart to the version the
 * wrapper was released for, so bumping the wrapper is what rolls them forward.
 */
function buildWrapperValues(input: AgentInstallInput): Record<string, unknown> {
	return {
		agent: {
			values: buildAgentValues(input),
			valuesFrom: [
				{
					kind: 'ConfigMap',
					name: AGENT_VALUES_NAME,
					valuesKey: AGENT_VALUES_KEY,
					optional: true
				}
			]
		},
		flux: {
			valuesFrom: [
				{
					kind: 'ConfigMap',
					name: FLUX_VALUES_NAME,
					valuesKey: FLUX_VALUES_KEY,
					optional: true
				}
			]
		}
	};
}

export function buildAgentInstallCommands(input: AgentInstallInput): AgentInstallCommands {
	const invalid = validateClusterName(input.cluster);
	if (invalid) {
		throw new Error(`cluster name ${invalid}`);
	}

	if (!input.joinToken) {
		throw new Error('join token must not be empty');
	}

	// No --values: helm-controller won't inherit it once it takes the release over,
	// so it'd have to be repeated under the wrapper's `flux.values` anyway or the
	// first reconcile rolls it back. No --version either, so both sides stay on
	// whatever the chart currently pins as its default.
	const fluxCommand = [
		`helm upgrade --install ${FLUX_RELEASE} ${FLUX_CHART_REF} \\`,
		`  --namespace ${AGENT_NAMESPACE} \\`,
		`  --create-namespace`
	].join('\n');

	// No --version: always the newest published tag, so version control lives in
	// the chart repo rather than being duplicated here.
	const wrapperValues = stringify(buildWrapperValues(input), { lineWidth: 0 });
	const wrapperCommand = [
		`helm upgrade --install ${AGENT_FLUX_RELEASE} ${AGENT_FLUX_CHART_REF} \\`,
		`  --namespace ${AGENT_NAMESPACE} \\`,
		`  --create-namespace \\`,
		`  --values - <<'${VALUES_DELIMITER}'`,
		wrapperValues.trimEnd(),
		VALUES_DELIMITER
	].join('\n');

	return {
		fluxCommand,
		agentCommand: wrapperCommand
	};
}

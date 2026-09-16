import { stringify } from 'yaml';

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { ModulesHelmRepositoryName } from '$lib/components/module-viewer/utils';

/**
 * Everything the wizard installs lands here: it is pinned by the agent chart's
 * own validate.yaml while tenantOperator is enabled, and the wrapper chart
 * creates its HelmReleases in its own release namespace — which makes this the
 * namespace Flux's release lives in too.
 */
const AGENT_NAMESPACE = 'otterscale-system';

/**
 * The wrapper chart. It installs nothing itself — it creates one HelmRelease for
 * the agent and one for Flux — so its release name only has to stay clear of the
 * release names those HelmReleases use (`otterscale-agent` and `flux`): two Helm
 * releases cannot share a name in one namespace.
 */
const AGENT_FLUX_RELEASE = 'otterscale-agent-flux';
const AGENT_FLUX_CHART_REF = 'oci://ghcr.io/otterscale/helm-charts/otterscale-agent-flux';

/**
 * INTERNAL WIRING: the Flux bootstrap has to land on the exact release name and
 * namespace the wrapper chart's Flux HelmRelease declares (its `flux.name`,
 * created in the wrapper's own namespace). helm-controller takes an existing
 * release over only under its exact name and storage namespace; anything else is
 * a second install of the same resources, which fails. Changing either side
 * means changing the other.
 */
const FLUX_RELEASE = 'flux';
const FLUX_CHART_REF = 'oci://ghcr.io/otterscale/helm-charts/flux';

/**
 * The HelmRepository the wrapper creates, and the one the Modules page reads its
 * catalog from — name and URL are one unit, so both are pinned here rather than
 * half here and half in the chart's defaults.
 *
 * An index, not the `oci://` reference the two commands above install from: the
 * index carries every chart's `annotations`, which is what the Modules page
 * filters on. The release workflow publishes to both, so the same version is
 * reachable either way. A `type: oci` repository would also stop the page's
 * index path from resolving it at all.
 */
const MODULES_REPOSITORY_URL = 'https://otterscale.github.io/helm-charts';

/**
 * Credentials reach the agent through its HelmRelease's `spec.valuesFrom`, not
 * `spec.values`: inline values are readable by anyone who can get helmreleases
 * in this namespace, and they travel into Flux's logs and into backups. The
 * wrapper chart's own values.yaml recommends the same split.
 *
 * The same name also carries an optional operator-managed ConfigMap (same key,
 * `values.yaml`) for non-secret overrides — e.g. pointing `image.repository`/
 * `tag` and `tenantOperator.images.*` at a mirror registry. `kind` is what
 * keeps the two apart; nothing here creates that ConfigMap, it's provisioned
 * out of band the same way the private-CA Secret is.
 */
const AGENT_SECRETS_NAME = 'otterscale-agent-secrets';
const AGENT_SECRETS_KEY = 'values.yaml';
const AGENT_VALUES_NAME = 'otterscale-agent-values';
const AGENT_VALUES_KEY = 'values.yaml';

/**
 * Same optional-override ConfigMap convention as every module HelmRelease
 * (module-viewer install.svelte / bulk-install.svelte): FluxCD skips it when
 * absent, so a cluster that never creates `flux-values` installs on the
 * chart's defaults untouched.
 */
const FLUX_VALUES_NAME = `${FLUX_RELEASE}-values`;
const FLUX_VALUES_KEY = 'values.yaml';

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

/** Not EOF: the generated documents below can't plausibly contain these lines. */
const VALUES_DELIMITER = 'VALUES';
const MANIFEST_DELIMITER = 'MANIFEST';

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
	/**
	 * Bootstraps Flux. Nothing reconciles a HelmRelease until its controllers and
	 * CRDs exist, so this runs before the wrapper — which then hands this very
	 * release over to Flux itself.
	 */
	fluxCommand: string;
	/**
	 * Applies the credentials Secret, then installs the wrapper, which creates the
	 * agent's and Flux's HelmReleases.
	 *
	 * One block rather than two things to copy: the Secret is not the operator’s to
	 * author, and nothing on this side can create it for them — reaching the target
	 * cluster needs the very agent this Secret is required to install.
	 */
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

/**
 * The agent values that are secrets, kept apart from buildAgentValues so the two
 * cannot be confused: this set only ever reaches the cluster inside a Secret.
 *
 * The Harbor robot's name rides along with its own secret rather than sitting in
 * the plain values, so the pair stays in one place.
 */
function buildCredentialValues(input: AgentInstallInput): Record<string, unknown> {
	return {
		agent: {
			joinToken: input.joinToken
		},
		tenantOperator: {
			harbor: {
				robot: {
					name: input.harborRobotName,
					secret: input.harborRobotSecret
				}
			}
		}
	};
}

/** The agent values that are configuration, passed through the wrapper's `agent.values`. */
function buildAgentValues(input: AgentInstallInput): Record<string, unknown> {
	const values: Record<string, unknown> = {
		agent: {
			serverURL: agentServerURL(),
			tunnelServerURL: required('AGENT_TUNNEL_SERVER_URL'),
			cluster: input.cluster
			// joinToken arrives through the credentials Secret instead.
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
				url: requiredPublic('PUBLIC_HARBOR_URL')
				// robot.name and robot.secret arrive through the credentials Secret.
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

/**
 * The wrapper's own values: which repository its HelmReleases pull from, the
 * agent's values split into the configuration half and a reference to the
 * credentials Secret, and an optional override ConfigMap for Flux itself.
 *
 * `agent.version` is deliberately left out. Empty pins the agent chart version
 * the wrapper was released for (its appVersion), which is what makes bumping the
 * wrapper the way to roll the agent forward. Same for `flux.version`: the
 * bootstrap above passes no version either, so both sides stay on the chart's
 * pinned default with nothing to keep in sync.
 */
function buildWrapperValues(input: AgentInstallInput): Record<string, unknown> {
	return {
		repository: {
			// The Modules page reads its catalog from a HelmRepository of this name in
			// this namespace, so pointing the releases at the same one keeps the
			// versions the page offers and the versions they can resolve identical.
			name: ModulesHelmRepositoryName,
			url: MODULES_REPOSITORY_URL
		},
		agent: {
			values: buildAgentValues(input),
			valuesFrom: [
				{
					kind: 'Secret',
					name: AGENT_SECRETS_NAME,
					valuesKey: AGENT_SECRETS_KEY
				},
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

	// No --values, deliberately: helm-controller does not inherit what a release
	// was installed with, so anything passed here would have to be repeated under
	// the wrapper's `flux.values`, or the first reconcile would roll it back to
	// the chart defaults. Leaving both sides on the chart's defaults keeps them in
	// agreement with nothing to maintain.
	//
	// No --version either: always the newest published tag, so the version this
	// bootstraps with is whatever the wrapper's chart repo currently pins as its
	// `flux.version` — version control lives in the chart, not here.
	const fluxCommand = [
		`helm upgrade --install ${FLUX_RELEASE} ${FLUX_CHART_REF} \\`,
		`  --namespace ${AGENT_NAMESPACE} \\`,
		`  --create-namespace`
	].join('\n');

	// Applied before the wrapper so the agent's HelmRelease finds it on its first
	// reconcile, and after the Flux bootstrap, which is what creates the namespace
	// it lands in. stringData, so the document stays readable in the wizard instead
	// of base64.
	//
	// The credential values are nested here as a YAML string, not a JS object:
	// they're the *contents* of a values.yaml file, not fields of the Secret
	// itself. `yaml` renders that nested string as an indented `|` block on its
	// own, so nothing here has to re-indent it by hand.
	const secretManifest = stringify(
		{
			apiVersion: 'v1',
			kind: 'Secret',
			metadata: { name: AGENT_SECRETS_NAME, namespace: AGENT_NAMESPACE },
			type: 'Opaque',
			stringData: {
				[AGENT_SECRETS_KEY]: stringify(buildCredentialValues(input), { lineWidth: 0 })
			}
		},
		{ lineWidth: 0 }
	);
	const credentialsManifest = [
		// Quoted delimiter: unquoted, the shell would expand Harbor's robot$<name>.
		`kubectl apply -f - <<'${MANIFEST_DELIMITER}'`,
		secretManifest.trimEnd(),
		MANIFEST_DELIMITER
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
		agentCommand: [credentialsManifest, '', wrapperCommand].join('\n')
	};
}

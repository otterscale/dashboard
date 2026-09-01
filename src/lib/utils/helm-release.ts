/**
 * FluxCD HelmReleases reach the cluster from two places in the console:
 * workspace users installing charts from the Application Hub, and cluster
 * admins installing platform modules and operators. KRO used to draw that line
 * for us — its HelmRelease wrapper stamped `app.kubernetes.io/managed-by=kro`
 * on the FluxCD release it generated, so the platform list could simply select
 * everything KRO had not created. With KRO gone both sides are plain FluxCD
 * releases, so the console marks the scope itself.
 *
 * The label goes on the HelmRelease's own `metadata.labels`, because that is
 * the only thing a HelmRelease `labelSelector` can match. `spec.commonMetadata`
 * carries the same label down onto every resource the release renders, so a
 * cluster-level release is recognizable from its workloads too.
 *
 * Releases installed before this label existed carry no scope at all, and all
 * of those are platform releases — hence the cluster selector matches "not
 * workspace" rather than "is cluster".
 */
const ReleaseScopeLabel = 'release.otterscale.io/scope';

const ClusterReleaseScope = 'cluster';
const WorkspaceReleaseScope = 'workspace';

/** Impersonated by FluxCD for workspace-level releases (`spec.serviceAccountName`). */
const WorkspaceReleaseServiceAccountName = 'workspace-sa';
/** Impersonated by FluxCD for cluster-level releases (`spec.serviceAccountName`). */
const ClusterReleaseServiceAccountName = 'cluster-sa';

const ClusterReleaseLabelSelector = `${ReleaseScopeLabel}!=${WorkspaceReleaseScope}`;
const WorkspaceReleaseLabelSelector = `${ReleaseScopeLabel}=${WorkspaceReleaseScope}`;

export {
	ClusterReleaseLabelSelector,
	ClusterReleaseScope,
	ClusterReleaseServiceAccountName,
	ReleaseScopeLabel,
	WorkspaceReleaseLabelSelector,
	WorkspaceReleaseScope,
	WorkspaceReleaseServiceAccountName
};

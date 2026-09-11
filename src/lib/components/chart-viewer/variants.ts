import {
	ClusterReleaseScope,
	PlatformReleaseServiceAccountName,
	WorkspaceReleaseScope,
	WorkspaceReleaseServiceAccountName
} from '$lib/utils/helm-release';

/**
 * The Hub and the Operator screens are one chart viewer over two different
 * sets of Helm charts: both list Harbor-backed HelmRepositories and install a
 * FluxCD HelmRelease from one of their charts. Everything that actually
 * differs between them is data — which repositories to read, and what the
 * release they produce looks like — so it lives here instead of in a forked
 * copy of the components.
 *
 * Each field below maps to one decision the shared components make, so the
 * whole behavioural delta between the two variants is readable in one place.
 */

/** Where a variant's HelmRepositories come from. */
type ChartRepositorySource =
	/** Every HelmRepository visible in the workspace's own namespace. */
	| { mode: 'workspace' }
	/** One well-known HelmRepository, addressed by namespace and name. */
	| { mode: 'named'; namespace: string; name: string };

/** Which Harbor project a variant's charts are pushed into. */
type HarborWarehouse =
	/** The project named after the workspace namespace. */
	| { mode: 'workspace' }
	/** A fixed project shared by every workspace. */
	| { mode: 'fixed'; project: string };

type ChartVariant = {
	id: 'hub' | 'operator';
	/** Heading above the table. */
	title: string;
	source: ChartRepositorySource;
	release: {
		/** Value stamped into `metadata.labels` under {@link ReleaseScopeLabel}. */
		scope: string;
		/** FluxCD impersonates this account — `spec.serviceAccountName`. */
		serviceAccountName: string;
		/**
		 * Whether to also stamp the scope label onto every resource the release
		 * renders, via `spec.commonMetadata`, so the release is recognizable from
		 * its workloads and not just from the HelmRelease object.
		 */
		propagateScopeLabel: boolean;
		/** FluxCD `spec.install.createNamespace`. */
		createNamespace: boolean;
		/**
		 * Whether the installer may retarget the release at another namespace.
		 * Workspace releases are pinned to the workspace's own namespace, so the
		 * field is shown read-only rather than hidden.
		 */
		editableTargetNamespace: boolean;
	};
	harborWarehouse: HarborWarehouse;
	/** Repository argument in the upload dialog's `docker push` example. */
	dockerPushTarget: string;
};

const HubChartVariant: ChartVariant = {
	id: 'hub',
	title: 'Hub',
	source: { mode: 'workspace' },
	release: {
		scope: WorkspaceReleaseScope,
		serviceAccountName: WorkspaceReleaseServiceAccountName,
		propagateScopeLabel: false,
		createNamespace: false,
		editableTargetNamespace: false
	},
	harborWarehouse: { mode: 'workspace' },
	dockerPushTarget: '<repository>'
};

const OperatorChartVariant: ChartVariant = {
	id: 'operator',
	title: 'Operator',
	source: { mode: 'named', namespace: 'otterscale-system', name: 'operators' },
	release: {
		scope: ClusterReleaseScope,
		serviceAccountName: PlatformReleaseServiceAccountName,
		propagateScopeLabel: true,
		createNamespace: true,
		editableTargetNamespace: true
	},
	harborWarehouse: { mode: 'fixed', project: 'operators' },
	dockerPushTarget: 'operators'
};

export { type ChartRepositorySource, type ChartVariant, HubChartVariant, OperatorChartVariant };

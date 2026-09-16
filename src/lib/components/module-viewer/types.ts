/**
 * A HelmRelease in the platform namespace, reduced to what marks a catalog entry
 * as installed. Upgrade and Uninstall address the release by its chart name: the
 * wrapper chart that brings the agent's and Flux's releases keeps their
 * `metadata.name` equal to the chart they install, same as this page does.
 */
interface InstalledModule {
	chart: string;
	version?: string;
}

interface ModuleMetadataType {
	apiVersion: string;
	appVersion: string;
	created: string;
	description: string;
	digest: string;
	home: string;
	icon: string;
	keywords: string[];
	maintainers: Array<{
		name: string;
		email?: string;
		url?: string;
	}>;
	name: string;
	type: string;
	urls: string[];
	version: string;
	annotations?: Record<string, string>;
}

interface ModuleType extends ModuleMetadataType {
	versions: ModuleMetadataType[];
}

interface HarborModule {
	digest: string;
	icon: string;
	labels: string[] | null;
	type: string;
	extra_attrs: {
		apiVersion: string;
		appVersion: string;
		annotations: Record<string, string>;
		name: string;
		description: string;
		version: string;
	};
}

export type { HarborModule, ModuleType as IndexModule, InstalledModule, ModuleType };

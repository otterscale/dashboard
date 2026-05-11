interface ModuleMetadataType {
	apiVersion: string;
	appVersion: string;
	created: string;
	description: string;
	digest: string;
	home: string;
	icon: string;
	keywords: string[];
	maintainers: {
		email: string;
		name: string;
	};
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

export type { HarborModule, ModuleType as IndexModule, ModuleType };

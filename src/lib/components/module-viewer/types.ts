interface IndexModuleMetadataType {
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

interface IndexModuleType extends IndexModuleMetadataType {
	versions: IndexModuleMetadataType[];
}

interface HarborModuleVersion {
	name: string;
	version: string;
	appVersion?: string;
	created?: string;
	description?: string;
	digest?: string;
	home?: string;
	icon?: string;
	urls: string[];
}

interface HarborModuleType {
	repository_name: string;
	digest: string;
	size: number;
	push_time: string | null;
	pull_time: string | null;
	type: string;
	labels: Array<{ name: string }>;
	tags: Array<{ name: string }>;
	extra_attrs: {
		name: string;
		version: string;
		description?: string;
		icon?: string;
		app_version?: string;
		home?: string;
		created?: string;
		urls: string[];
	};
	versions: HarborModuleVersion[];
	annotations?: Record<string, string>;
}

export { type HarborModuleType, type HarborModuleVersion, type IndexModuleType };

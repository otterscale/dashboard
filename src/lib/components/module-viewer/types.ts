interface SingleModuleType {
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

interface ModuleType extends SingleModuleType {
	versions: SingleModuleType[];
}

export { type ModuleType };

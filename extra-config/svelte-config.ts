interface TsConfig {
	include?: string[];
	[key: string]: unknown;
}

// No-op
export function applyExtraSvelteConfigs(config: TsConfig): TsConfig {
	if (config.include) {
		config.include.push('../ee/src/**/*.js', '../ee/src/**/*.ts', '../ee/src/**/*.svelte');
	}
	return config;
}

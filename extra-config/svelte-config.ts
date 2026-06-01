interface TsConfig {
	include?: string[];
	[key: string]: unknown;
}

// No-op
export function applyExtraSvelteConfigs(config: TsConfig): TsConfig {
	return config;
}

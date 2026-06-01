import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { mdsvex } from 'mdsvex';

import { applyExtraSvelteConfigs } from './extra-config/svelte-config.ts';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: [vitePreprocess(), mdsvex()],
	kit: {
		adapter: adapter(),
		version: {
			name: process.env.VERSION || 'devel'
		},
		typescript: {
			config: applyExtraSvelteConfigs
		}
	},
	extensions: ['.svelte', '.svx']
};

export default config;

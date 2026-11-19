import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { playwright } from '@vitest/browser-playwright';
import type { Plugin } from 'vite';
import devtoolsJson from 'vite-plugin-devtools-json';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { defineConfig } from 'vitest/config';

import { extraVitePlugins } from './extra-config/vite-config.ts';

/*
 * The shadcn.io components (src/lib/components/shadcnio) are built on Ark UI, which
 * reaches svelte/attachments through @zag-js/svelte. That module sits in an import
 * cycle inside Svelte. SvelteKit loads a layout and its page side by side, and when
 * both pull the module in at the same moment the dev server's module runner hands
 * one of them a copy whose imports are not initialised yet: the page then answers
 * 500 with "Cannot access '__vite_ssr_import_1__' before initialization".
 *
 * Loading the module once, on its own, when the dev server starts avoids that.
 * Only the dev server needs it: a build resolves the cycle when it bundles.
 */
const warmSvelteAttachments = (): Plugin => ({
	name: 'warm-svelte-attachments',
	apply: 'serve',
	configureServer(server) {
		return () => {
			void server.ssrLoadModule('svelte/attachments').catch(() => {});
		};
	}
});

export default defineConfig({
	plugins: [
		...extraVitePlugins(),
		tailwindcss(),
		sveltekit(),
		warmSvelteAttachments(),
		devtoolsJson(),
		paraglideVitePlugin({
			project: './project.inlang',
			outdir: './src/lib/paraglide'
		}),
		viteStaticCopy({
			targets: [
				{
					src: 'node_modules/monaco-editor/min/vs',
					dest: 'monaco-editor'
				}
			]
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}', 'ee/src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});

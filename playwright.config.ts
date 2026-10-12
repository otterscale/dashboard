import { defineConfig } from '@playwright/test';

// E2E_BASE_URL runs the suite against a deployed dashboard (e2e/tenant-metrics
// needs a real Keycloak user and hub); without it, against a local preview.
const baseURL = process.env.E2E_BASE_URL;

export default defineConfig({
	testDir: 'e2e',
	...(baseURL
		? {
				use: {
					baseURL,
					ignoreHTTPSErrors: process.env.E2E_IGNORE_HTTPS_ERRORS === '1'
				}
			}
		: {
				webServer: {
					command: 'npm run build && npm run preview',
					port: 4173
				}
			})
});

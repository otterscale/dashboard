import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import lodash from 'lodash';
import { SvelteURL } from 'svelte/reactivity';

function encodeHarborURIComponent(value: string): string {
	return value.includes('/')
		? encodeURIComponent(encodeURIComponent(value))
		: encodeURIComponent(value);
}

/**
 * Parse `spec.url` into a URL, raising an error that names the HelmRepository.
 * The URL constructor throws on malformed input rather than returning a falsy
 * value, so validation has to go through try/catch.
 */
function parseHelmRepositoryURL(helmRepository: SourceToolkitFluxcdIoV1HelmRepository): SvelteURL {
	const name = helmRepository.metadata?.name;
	const rawURL = helmRepository.spec?.url;
	if (!rawURL) {
		throw new Error(`HelmRepository "${name}": missing spec.url`);
	}
	try {
		return new SvelteURL(rawURL);
	} catch {
		throw new Error(`HelmRepository "${name}": invalid URL "${rawURL}"`);
	}
}

function parseHarborHost(helmRepository: SourceToolkitFluxcdIoV1HelmRepository) {
	const url = parseHelmRepositoryURL(helmRepository);
	const insecure = helmRepository.spec?.insecure;
	const protocol = insecure ? 'http' : 'https';
	return `${protocol}://${url.host}`;
}

function parseHarborProjectName(helmRepository: SourceToolkitFluxcdIoV1HelmRepository): string {
	const url = parseHelmRepositoryURL(helmRepository);
	const project = lodash.trim(url.pathname, '/');

	return project;
}

export { encodeHarborURIComponent, parseHarborHost, parseHarborProjectName };

import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import lodash from 'lodash';
import { SvelteURL } from 'svelte/reactivity';

function encodeURIComponentWithSlashEscape(value: string): string {
	return value.includes('/')
		? encodeURIComponent(encodeURIComponent(value))
		: encodeURIComponent(value);
}

function parseHarborHost(helmRepository: SourceToolkitFluxcdIoV1HelmRepository) {
	const url = new SvelteURL(helmRepository.spec?.url ?? '');
	const insecure = helmRepository.spec?.insecure;
	const protocol = insecure ? 'http' : 'https';
	return `${protocol}://${url.host}`;
}

function parseProjectName(helmRepository: SourceToolkitFluxcdIoV1HelmRepository): string {
	const url = new SvelteURL(helmRepository.spec?.url ?? '');
	if (!url) {
		const name = helmRepository.metadata?.name;
		throw new Error(`HelmRepository "${name}": invalid URL "${url}"`);
	}
	const project = lodash.trim(url.pathname, '/');

	return project;
}

export { encodeURIComponentWithSlashEscape, parseHarborHost, parseProjectName };

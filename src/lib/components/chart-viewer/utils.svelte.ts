import type { JsonValue } from '@bufbuild/protobuf';
import type { Client } from '@connectrpc/connect';
import { ResourceService } from '@otterscale/api/resource/v1';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import lodash from 'lodash';
import { SvelteURL } from 'svelte/reactivity';
import { toast } from 'svelte-sonner';

import { type ChartAttribute, getChartDataFromHarbor } from './table-layout';
import type { ArtifactChartType } from './types';
import type { ChartRepositorySource, ChartVariant } from './variants';

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

type ResourceClient = Client<typeof ResourceService>;

const HelmRepositoryGroup = 'source.toolkit.fluxcd.io';
const HelmRepositoryVersion = 'v1';
const HelmRepositoryResource = 'helmrepositories';

const HarborChartMediaType = 'application/vnd.cncf.helm.config.v1+json';
const HarborPageSize = 50;

/** Set by the platform on repositories it mirrors into Harbor. */
const FromHarborLabel = 'tenant.otterscale.io/from-harbor';

/** Resolve the HelmRepositories a chart variant draws its charts from. */
async function listHelmRepositories(
	resourceClient: ResourceClient,
	cluster: string,
	namespace: string,
	source: ChartRepositorySource
): Promise<SourceToolkitFluxcdIoV1HelmRepository[]> {
	if (source.mode === 'named') {
		const response = await resourceClient.get({
			cluster,
			namespace: source.namespace,
			name: source.name,
			group: HelmRepositoryGroup,
			version: HelmRepositoryVersion,
			resource: HelmRepositoryResource
		});

		if (!response.object) {
			toast.info(`There is no HelmRepository "${source.name}".`);
			return [];
		}

		return [response.object as SourceToolkitFluxcdIoV1HelmRepository];
	}

	const response = await resourceClient.list({
		cluster,
		namespace,
		group: HelmRepositoryGroup,
		version: HelmRepositoryVersion,
		resource: HelmRepositoryResource
	});

	const helmRepositories = response.items
		.map((item) => item.object as SourceToolkitFluxcdIoV1HelmRepository | undefined)
		.filter((helmRepository) => helmRepository !== undefined);

	if (helmRepositories.length === 0) {
		toast.info('No HelmRepository resources found in this namespace');
	}

	return helmRepositories;
}

/**
 * Page through one repository's Harbor project for the latest chart in every
 * repository it holds. Harbor reports no total, so the loop stops on the first
 * empty page. A repository that cannot be read yields nothing rather than
 * failing the whole listing — the other repositories are still worth showing.
 */
async function listChartsInHelmRepository(
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Promise<Record<ChartAttribute, JsonValue>[]> {
	const helmRepositoryName = helmRepository.metadata?.name ?? '';

	// Charts are installed from Harbor only, so a repository we cannot browse
	// through the Harbor API has nothing installable behind it.
	const fromHarbor = lodash.get(helmRepository, ['metadata', 'labels', FromHarborLabel]) === 'true';
	if (!fromHarbor) {
		toast.info(`HelmRepository "${helmRepositoryName}": skipped, not backed by Harbor`);
		return [];
	}

	try {
		const harborHost = parseHarborHost(helmRepository);
		const harborProjectName = parseHarborProjectName(helmRepository);

		let charts: Record<ChartAttribute, JsonValue>[] = [];
		let currentPage = 1;

		while (true) {
			const artifactsUrl = `/api/v2.0/projects/${encodeHarborURIComponent(harborProjectName)}/artifacts?q=media_type=${encodeHarborURIComponent(HarborChartMediaType)}&page=${currentPage}&page_size=${HarborPageSize}&latest_in_repository=true`;
			const response = await fetch('/bff/helm/repository/harbor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					harborHost,
					apiPath: artifactsUrl
				})
			});

			if (!response.ok) {
				break;
			}

			const artifactCharts: ArtifactChartType[] = await response.json();
			if (artifactCharts.length === 0) {
				break;
			}

			charts = [
				...charts,
				...artifactCharts.map((artifactChart) =>
					getChartDataFromHarbor(artifactChart, helmRepository)
				)
			];

			currentPage = currentPage + 1;
		}

		return charts;
	} catch (error) {
		console.error(`HelmRepository "${helmRepositoryName}": error fetching charts:`, error);
		toast.error(`HelmRepository "${helmRepositoryName}": unable to reach repository`);
		return [];
	}
}

/** Every installable chart behind a chart variant, as table rows. */
async function listCharts(
	resourceClient: ResourceClient,
	cluster: string,
	namespace: string,
	chartVariant: ChartVariant
): Promise<Record<ChartAttribute, JsonValue>[]> {
	try {
		const helmRepositories = await listHelmRepositories(
			resourceClient,
			cluster,
			namespace,
			chartVariant.source
		);

		const chartsPerHelmRepository = await Promise.all(
			helmRepositories.map((helmRepository) => listChartsInHelmRepository(helmRepository))
		);

		return chartsPerHelmRepository.flat();
	} catch (error) {
		console.error('Failed to list HelmRepositories:', error);
		toast.error('Failed to list HelmRepository resources');
		return [];
	}
}

export { encodeHarborURIComponent, listCharts, parseHarborHost, parseHarborProjectName };

<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import CableIcon from '@lucide/svelte/icons/cable';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import {
		ResourceService,
		type SchemaRequest,
		WatchEvent_Type
	} from '@otterscale/api/resource/v1';
	import type {
		HelmToolkitFluxcdIoV2HelmRelease,
		SourceToolkitFluxcdIoV1HelmRepository
	} from '@otterscale/types';
	import type { Schema } from '@sjsf/form';
	import Ajv, { type ValidateFunction } from 'ajv';
	import lodash from 'lodash';
	import semver from 'semver';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import type { ChartType } from '$lib/components/chart-viewer/types';
	import {
		encodeHarborURIComponent,
		parseHarborHost,
		parseHarborProjectName
	} from '$lib/components/chart-viewer/utils.svelte';
	import { ModuleViewer } from '$lib/components/module-viewer';
	import { getChartData, type ModuleAttribute } from '$lib/components/module-viewer/table-layout';
	import type {
		HarborModule,
		IndexModule,
		InstalledModule,
		ModuleType
	} from '$lib/components/module-viewer/types';
	import { ModulesHelmRepositoryName } from '$lib/components/module-viewer/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.module(),
			url: resolve('/(auth)/[cluster]/[workspace]/modules', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const dashboardVersion = semver.valid(version) ? version : '1.0.0';

	// Parameters
	const cluster = $derived(page.params.cluster ?? '');
	const namespace = 'otterscale-system';

	// Clients
	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// data
	let data: Record<ModuleAttribute, JsonValue>[] = $state([]);
	// schema
	let schema: Schema | undefined = $state(undefined);
	// validate
	let validate: ValidateFunction | undefined = $state(undefined);

	// Helm Repository
	let helmRepository = $state<SourceToolkitFluxcdIoV1HelmRepository | undefined>(undefined);
	let isHelmRepositoryFetching = $state(false);
	async function fetchHelmRepository(): Promise<SourceToolkitFluxcdIoV1HelmRepository | undefined> {
		if (isHelmRepositoryFetching) return;

		isHelmRepositoryFetching = true;

		try {
			const response = await resourceClient.get({
				cluster,
				namespace,
				name: ModulesHelmRepositoryName,
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				resource: 'helmrepositories'
			});

			if (!response.object) {
				toast.info('There is no Modules Helm Repository.');
				return;
			}

			return response.object as SourceToolkitFluxcdIoV1HelmRepository;
		} catch (error) {
			console.error(
				'Modules Helm Repository was not found in namespace otterscale-system.:',
				error
			);
			toast.error('Modules Helm Repository was not found in namespace otterscale-system.');
		} finally {
			isHelmRepositoryFetching = false;
		}
	}
	const fromHarbor: boolean = $derived(
		helmRepository
			? lodash.get(helmRepository, ['metadata', 'labels', 'tenant.otterscale.io/from-harbor']) ===
					'true'
			: false
	);

	let modules = $state<ModuleType[]>([]);
	let isModuleFetching = $state(false);
	async function fetchModules(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<ModuleType[] | undefined> {
		if (isModuleFetching) return;

		isModuleFetching = true;

		try {
			const entireModules = fromHarbor
				? await fetchEntireModulesFromHarbor(helmRepository)
				: await fetchEntireModulesFromIndex(helmRepository);

			return entireModules;
		} catch (error) {
			const helmRepositoryName = helmRepository.metadata?.name ?? '';
			console.error(`HelmRepository "${helmRepositoryName}": error fetching modules:`, error);
			toast.error(`HelmRepository "${helmRepositoryName}": unable to reach repository`);
		} finally {
			isModuleFetching = false;
		}
	}
	async function fetchEntireModulesFromHarbor(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<ModuleType[]> {
		const pageSize = 50;
		const versionPrefix = `${semver.major(dashboardVersion)}.${semver.minor(dashboardVersion)}.`;

		const harborHost = parseHarborHost(helmRepository);
		const harborProjectName = parseHarborProjectName(helmRepository);

		let currentPage = 1;
		let harborModules: HarborModule[] = [];

		while (true) {
			const artifactsUrl = `/api/v2.0/projects/${encodeHarborURIComponent(harborProjectName)}/artifacts?q=media_type=${encodeHarborURIComponent('application/vnd.cncf.helm.config.v1+json')},tags=~${encodeHarborURIComponent(versionPrefix)}&page=${currentPage}&page_size=${pageSize}`;
			const response = await fetch('/bff/helm/repository/harbor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					harborHost,
					apiPath: artifactsUrl
				})
			});

			if (!response.ok) {
				throw new Error(
					`Harbor artifacts request failed on page ${currentPage}: ${response.status} ${response.statusText}`
				);
			}

			const pageModules: HarborModule[] = await response.json();
			if (pageModules.length === 0) {
				break;
			}

			harborModules = [...harborModules, ...pageModules];

			if (pageModules.length < pageSize) {
				break;
			}

			currentPage = currentPage + 1;
		}

		const modulesByName = lodash.groupBy(
			harborModules.map((module: HarborModule) => {
				return {
					apiVersion: module.extra_attrs.apiVersion,
					appVersion: module.extra_attrs.appVersion,
					annotations: module.extra_attrs.annotations,
					name: module.extra_attrs.name,
					description: module.extra_attrs.description,
					version: module.extra_attrs.version,
					digest: module.digest,
					icon: module.icon,
					keywords: module.labels ?? [],
					type: module.type
				} as ModuleType;
			}),
			(module) => module.name
		);

		return Object.values(modulesByName)
			.map((versions) => {
				const validVersions = versions.sort((p, n) => semver.rcompare(p.version, n.version));
				const [latestValidVersion] = validVersions;
				if (latestValidVersion) {
					return {
						...latestValidVersion,
						versions: validVersions
					};
				}
			})
			.filter(Boolean) as ModuleType[];
	}
	async function fetchEntireModulesFromIndex(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<ModuleType[]> {
		const response = await fetch('/bff/helm/repository/index', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				repositoryUrl: helmRepository.spec?.url ?? ''
			})
		});

		if (!response.ok) {
			throw new Error(`Charts request failed on index: ${response.status} ${response.statusText}`);
		}

		const indexModules: Record<string, ChartType[]> = await response.json();
		return Object.values(indexModules)
			.map((versions) => {
				const validVersions = versions.sort((p, n) => semver.rcompare(p.version, n.version));
				const [latestValidVersion] = validVersions;
				if (latestValidVersion) {
					return {
						...latestValidVersion,
						versions: validVersions
					};
				}
			})
			.filter(Boolean) as IndexModule[] as ModuleType[];
	}

	// Releases
	let releases: HelmToolkitFluxcdIoV2HelmRelease[] = $state([]);
	let isReleaseFetching = $state(false);
	let releaseResourceVersion: string | undefined = $state(undefined);
	async function listReleases() {
		if (isReleaseFetching) return;

		isReleaseFetching = true;

		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'helm.toolkit.fluxcd.io',
				version: 'v2',
				resource: 'helmreleases'
			});

			releaseResourceVersion = response.resourceVersion;

			releases = response.items.map((item) => item.object as HelmToolkitFluxcdIoV2HelmRelease);
		} catch (error) {
			console.error('Modules Helm Releases was not found in namespace otterscale-system.:', error);
			toast.error('Modules Helm Releases was not found in namespace otterscale-system.');
		} finally {
			isReleaseFetching = false;
		}
	}
	let watchAbortController: AbortController | null = null;
	let isWatching = $state(false);
	async function watchReleases() {
		if (isReleaseFetching || isWatching || isDestroyed) return;

		isWatching = true;
		watchAbortController = new AbortController();
		try {
			const stream = resourceClient.watch(
				{
					cluster,
					namespace,
					group: 'helm.toolkit.fluxcd.io',
					version: 'v2',
					resource: 'helmreleases',
					resourceVersion: releaseResourceVersion
				},
				{ signal: watchAbortController.signal }
			);

			for await (const event of stream) {
				// eslint-disable-next-line
				const response: any = event;

				if (response.type === WatchEvent_Type.ERROR) {
					continue;
				}

				if (response.type === WatchEvent_Type.BOOKMARK) {
					releaseResourceVersion = response.resourceVersion as string;
					continue;
				}

				releaseResourceVersion = response.resource?.object?.metadata?.resourceVersion;

				if (response.type === WatchEvent_Type.ADDED) {
					const addedRelease = response.resource?.object as HelmToolkitFluxcdIoV2HelmRelease;
					releases = [...releases, addedRelease];
				} else if (response.type === WatchEvent_Type.MODIFIED) {
					const modifiedRelease = response.resource?.object as HelmToolkitFluxcdIoV2HelmRelease;
					releases = releases.map((release) =>
						release.metadata?.name === modifiedRelease.metadata?.name ? modifiedRelease : release
					);
				} else if (response.type === WatchEvent_Type.DELETED) {
					const deletedRelease = response.resource?.object as HelmToolkitFluxcdIoV2HelmRelease;
					releases = releases.filter(
						(release) => release.metadata?.name !== deletedRelease.metadata?.name
					);
				}
			}
		} catch (error) {
			if (watchAbortController.signal.aborted) return;
			console.error('Failed to watch helmreleases:', error);
		} finally {
			if (!isDestroyed) {
				toast.info('Watching installed modules was disconnected.');
			}
			isWatching = false;
			watchAbortController = null;
		}
	}

	// schema
	async function fetchSchema() {
		try {
			const schemaResponse = await resourceClient.schema({
				cluster,
				group: 'helm.toolkit.fluxcd.io',
				version: 'v2',
				kind: 'HelmRelease'
			} as SchemaRequest);

			return schemaResponse.schema as Schema;
		} catch (error) {
			console.error('Failed to fetch HelmRelease schema:', error);
			toast.error('Failed to fetch HelmRelease schema');
			return undefined;
		}
	}

	// validator
	const jsonSchemaValidator = new Ajv({ allErrors: true, strict: false, logger: false });
	function getValidate(jsonSchema: Schema) {
		return jsonSchemaValidator.compile($state.snapshot(jsonSchema));
	}

	function handleReload() {
		if (!isWatching) {
			watchReleases();
			return;
		}
		if (watchAbortController) {
			watchAbortController.abort();
		}
	}

	onMount(async () => {
		helmRepository = await fetchHelmRepository();
		if (!helmRepository) return;

		modules = (await fetchModules(helmRepository)) ?? [];

		await listReleases();
		watchReleases();

		schema = await fetchSchema();
		if (schema) {
			validate = getValidate(schema);
		}
	});
	$effect(() => {
		const installedModules: InstalledModule[] = releases
			.map((release) => release.spec?.chart?.spec as InstalledModule)
			.filter(Boolean);

		data = modules.map((module) => getChartData(module, installedModules, helmRepository!));
	});

	let isDestroyed = false;
	onDestroy(() => {
		isDestroyed = true;
		if (watchAbortController) {
			watchAbortController.abort();
		}
	});
</script>

{#key cluster + helmRepository?.metadata?.uid}
	{#if schema}
		<main class="pb-8">
			<ModuleViewer {cluster} {namespace} {data} {schema} {validate}>
				{#snippet reload()}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button {...props} onclick={handleReload} variant="outline" size="icon">
									{#if isWatching}
										<CableIcon class="size-4" />
									{:else}
										<UnplugIcon class="size-4 text-destructive" />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>
							<p>{isWatching ? 'Watching' : 'Reconnect'}</p>
						</Tooltip.Content>
					</Tooltip.Root>
				{/snippet}
			</ModuleViewer>
		</main>
	{/if}
{/key}

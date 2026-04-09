<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import CableIcon from '@lucide/svelte/icons/cable';
	import UnplugIcon from '@lucide/svelte/icons/unplug';
	import { ResourceService, WatchEvent_Type } from '@otterscale/api/resource/v1';
	import type {
		HelmToolkitFluxcdIoV2HelmRelease,
		SourceToolkitFluxcdIoV1HelmRepository
	} from '@otterscale/types';
	import lodash from 'lodash';
	import semver from 'semver';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import {
		encodeHarborURIComponent,
		parseHarborHost,
		parseHarborProjectName
	} from '$lib/components/artifact-viewer/utils.svelte';
	import { ModuleViewer } from '$lib/components/module-viewer';
	import {
		getChartData,
		getChartDataFromHarbor,
		type ModuleAttribute
	} from '$lib/components/module-viewer/table-layout';
	import type { HarborModuleType, ModuleType } from '$lib/components/module-viewer/types';
	import Button from '$lib/components/ui/button/button.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.application_hub(),
			url: resolve('/(auth)/[cluster]/[workspace]/modules', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	// Parameters
	const cluster = $derived(page.params.cluster ?? '');
	const namespace = 'otterscale-system';

	// Clients
	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let data: Record<ModuleAttribute, JsonValue>[] | undefined = $state(undefined);

	// Helm Repository
	let helmRepository: SourceToolkitFluxcdIoV1HelmRepository | undefined = $state(undefined);
	let isHelmRepositoryFetching = $state(false);
	let fromHarbor = $state(false);

	async function fetchHelmRepository(): Promise<SourceToolkitFluxcdIoV1HelmRepository | undefined> {
		if (isHelmRepositoryFetching) return;

		isHelmRepositoryFetching = true;

		try {
			const response = await resourceClient.get({
				cluster,
				namespace,
				name: 'otterscale-charts',
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				resource: 'helmrepositories'
			});

			if (!response.object) {
				toast.info('There is no OtterScale Charts Helm Repository.');
				return;
			}

			const repo = response.object as SourceToolkitFluxcdIoV1HelmRepository;
			fromHarbor =
				lodash.get(repo, ['metadata', 'labels', 'tenant.otterscale.io/from-harbor']) === 'true';

			return repo;
		} catch (error) {
			console.error(
				'OtterScale Charts Helm Repository was not found in namespace otterscale-system.:',
				error
			);
			toast.error(
				'OtterScale Charts Helm Repository was not found in namespace otterscale-system.'
			);
		} finally {
			isHelmRepositoryFetching = false;
		}
	}

	// Modules (index source)
	let modules: ModuleType[] = $state([]);
	// Modules (harbor source)
	let harborModules: HarborModuleType[] = $state([]);
	let isModuleFetching = $state(false);

	async function fetchModules(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<ModuleType[] | undefined> {
		if (isModuleFetching) return;

		isModuleFetching = true;

		try {
			const response = await fetch('/bff/helm/repository/index', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster,
					namespace,
					repositoryUrl: helmRepository.spec?.url ?? ''
				})
			});

			if (!response.ok) {
				return;
			}

			const entireModules = await response.json();

			return entireModules
				.filter((module: ModuleType) =>
					semver.gte(module.version, semver.valid(version) ? version : 'v0.0.0')
				)
				.filter((module: ModuleType) => module.name.startsWith('otterscale-'));
		} catch (error) {
			const helmRepositoryName = helmRepository.metadata?.name ?? '';
			console.error(`HelmRepository "${helmRepositoryName}": error fetching modules:`, error);
			toast.error(`HelmRepository "${helmRepositoryName}": unable to reach repository`);
		} finally {
			isModuleFetching = false;
		}
	}

	async function fetchHarborModules(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<HarborModuleType[] | undefined> {
		if (isModuleFetching) return;

		isModuleFetching = true;

		try {
			const harborHost = parseHarborHost(helmRepository);
			const harborProjectName = parseHarborProjectName(helmRepository);
			const secretName = helmRepository.spec?.secretRef?.name ?? '';
			const artifactsUrl = `/api/v2.0/projects/${encodeHarborURIComponent(harborProjectName)}/artifacts?q=media_type=${encodeHarborURIComponent('application/vnd.cncf.helm.config.v1+json')}&latest_in_repository=true`;

			const response = await fetch('/bff/helm/repository/harbor', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster,
					namespace,
					harborHost,
					secretName,
					apiPath: artifactsUrl
				})
			});

			if (!response.ok) {
				return;
			}

			const entireModules: HarborModuleType[] = await response.json();

			return entireModules.filter((module) =>
				(module.extra_attrs?.name ?? '').startsWith('otterscale-')
			);
		} catch (error) {
			const helmRepositoryName = helmRepository.metadata?.name ?? '';
			console.error(`HelmRepository "${helmRepositoryName}": error fetching Harbor modules:`, error);
			toast.error(`HelmRepository "${helmRepositoryName}": unable to reach Harbor repository`);
		} finally {
			isModuleFetching = false;
		}
	}

	// Releases
	let isReleaseFetching = $state(false);
	let releases: HelmToolkitFluxcdIoV2HelmRelease[] = $state([]);
	let releaseResourceVersion: string | undefined = $state(undefined);

	function buildData() {
		const installedModules = new Set(
			releases.map((release) => release.spec?.chart?.spec.chart).filter(Boolean)
		) as Set<string>;

		if (fromHarbor) {
			data = harborModules.map((module) =>
				getChartDataFromHarbor(module, installedModules, helmRepository!)
			);
		} else {
			data = modules.map((module) =>
				getChartData(module, installedModules, helmRepository!)
			);
		}
	}

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

			buildData();
		} catch (error) {
			console.error(
				'OtterScale Charts Helm Releases was not found in namespace otterscale-system.:',
				error
			);
			toast.error('OtterScale Charts Helm Releases was not found in namespace otterscale-system.');
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

				buildData();
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

		if (fromHarbor) {
			harborModules = (await fetchHarborModules(helmRepository)) ?? [];
			if (!harborModules.length) return;
		} else {
			modules = (await fetchModules(helmRepository)) ?? [];
			if (!modules.length) return;
		}

		await listReleases();
		watchReleases();
	});

	let isDestroyed = false;
	onDestroy(() => {
		isDestroyed = true;
		if (watchAbortController) {
			watchAbortController.abort();
		}
	});
</script>

{#key cluster}
	{#if data}
		<main class="pb-8">
			<ModuleViewer {cluster} {namespace} {data}>
				{#snippet reload()}
					<Button onclick={handleReload} variant="outline" size="icon">
						{#if isWatching}
							<CableIcon class="size-4" />
						{:else}
							<UnplugIcon class="size-4 text-destructive" />
						{/if}
					</Button>
				{/snippet}
			</ModuleViewer>
		</main>
	{:else}
		<!-- Fallback to Dynamic Table -->
	{/if}
{/key}

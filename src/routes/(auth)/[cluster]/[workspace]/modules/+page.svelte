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
		getChartDataFromIndex,
		type ModuleAttribute
	} from '$lib/components/module-viewer/table-layout';
	import type { IndexModuleType } from '$lib/components/module-viewer/types';
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

	let data: Record<ModuleAttribute, JsonValue>[] = $state([]);

	// Helm Repository
	let helmRepository: SourceToolkitFluxcdIoV1HelmRepository | undefined = $state(undefined);
	let isHelmRepositoryFetching = $state(false);
	const fromHarbor: boolean = $derived(
		helmRepository
			? lodash.get(helmRepository, ['metadata', 'labels', 'tenant.otterscale.io/from-harbor']) ===
					'true'
			: false
	);

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

			return response.object as SourceToolkitFluxcdIoV1HelmRepository;
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

	let isModuleFetching = $state(false);

	const minimumVersion = semver.valid(version)
		? `${semver.major(version)}.${semver.minor(version)}.0`
		: '1.0.0';

	let indexModules: IndexModuleType[] = $state([]);

	async function fetchIndexModules(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<IndexModuleType[] | undefined> {
		if (isModuleFetching) return;

		isModuleFetching = true;

		let entireModules: IndexModuleType[] = [];

		try {
			if (fromHarbor) {
				const harborHost = parseHarborHost(helmRepository);
				const harborProjectName = parseHarborProjectName(helmRepository);
				const artifactsUrl = `/api/v2.0/projects/${encodeHarborURIComponent(harborProjectName)}/artifacts?q=media_type=${encodeHarborURIComponent('application/vnd.cncf.helm.config.v1+json')}&latest_in_repository=true`;

				const response = await fetch('/bff/helm/repository/harbor', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						harborHost,
						apiPath: artifactsUrl
					})
				});

				if (!response.ok) {
					return;
				}

				const entireHarborModules: any = await response.json();

				entireModules = entireHarborModules.map((module: any) => {
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
					};
				});
			} else {
				const response = await fetch('/bff/helm/repository/index', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						repositoryUrl: helmRepository.spec?.url ?? ''
					})
				});

				if (!response.ok) {
					return;
				}

				entireModules = await response.json();
			}

			console.log(entireModules);

			return entireModules
				.filter((module: IndexModuleType) => {
					const moduleVersion = module.version;
					const moduleMinorVersion = `${semver.major(moduleVersion)}.${semver.minor(moduleVersion)}.0`;
					return semver.gte(moduleMinorVersion, minimumVersion);
				})
				.filter((module: IndexModuleType) => module.name.startsWith('otterscale-'));
		} catch (error) {
			const helmRepositoryName = helmRepository.metadata?.name ?? '';
			console.error(`HelmRepository "${helmRepositoryName}": error fetching modules:`, error);
			toast.error(`HelmRepository "${helmRepositoryName}": unable to reach repository`);
		} finally {
			isModuleFetching = false;
		}
	}

	// Releases
	let isReleaseFetching = $state(false);
	let releases: HelmToolkitFluxcdIoV2HelmRelease[] = $state([]);
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

		indexModules = (await fetchIndexModules(helmRepository)) ?? [];
		if (!indexModules.length) return;

		await listReleases();
		watchReleases();
	});
	$effect(() => {
		const installedModules = new Set(
			releases.map((release) => release.spec?.chart?.spec.chart).filter(Boolean)
		) as Set<string>;

		data = indexModules.map((module) =>
			getChartDataFromIndex(module, installedModules, helmRepository!)
		);
	});

	let isDestroyed = false;
	onDestroy(() => {
		isDestroyed = true;
		if (watchAbortController) {
			watchAbortController.abort();
		}
	});
</script>

{#key cluster + String(fromHarbor)}
	<main class="pb-8">
		<ModuleViewer {cluster} {namespace} {data} {fromHarbor}>
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
{/key}

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
	import semver from 'semver';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';

	import { version } from '$app/environment';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ModuleViewer } from '$lib/components/module-viewer';
	import type { ModuleAttribute } from '$lib/components/module-viewer/table-layout';
	import { getChartData } from '$lib/components/module-viewer/table-layout';
	import type { ModuleType } from '$lib/components/module-viewer/types';
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

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = 'otterscale-system';

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let data: Record<ModuleAttribute, JsonValue>[] = $state([]);
	let installedModules: Set<string> = $state(new Set());

	let helmRepository: SourceToolkitFluxcdIoV1HelmRepository | undefined = $state(undefined);

	let isHelmRepositoryFetching = $state(false);

	async function fetchHelmRepository(): Promise<SourceToolkitFluxcdIoV1HelmRepository | undefined> {
		if (isHelmRepositoryFetching) return;

		isHelmRepositoryFetching = true;

		try {
			const response = await resourceClient.get({
				cluster,
				namespace: 'otterscale-system',
				name: 'otterscale-charts',
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				resource: 'helmrepositories'
			});

			if (!response.object) {
				toast.info('There is no OtterScale Charts Helm Repository.');
				return;
			}

			return response.object;
		} catch (error) {
			console.error(
				'OtterScale Charts Helm Repository was not found in namespace ottersacle-system.:',
				error
			);
			toast.error(
				'OtterScale Charts Helm Repository was not found in namespace ottersacle-system.'
			);
		} finally {
			isHelmRepositoryFetching = false;
		}
	}

	let modules: ModuleType[] = $state([]);
	let isModuleFetching = $state(false);

	async function fetchModules(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	): Promise<ModuleType[] | undefined> {
		if (isModuleFetching) return;

		isModuleFetching = true;

		const helmRepositoryName = helmRepository.metadata?.name ?? '';
		const repositoryUrl = helmRepository.spec?.url ?? '';
		const secretName = helmRepository.spec?.secretRef?.name ?? '';

		try {
			const response = await fetch('/bff/helm/repository/index', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster,
					namespace,
					repositoryUrl,
					secretName
				})
			});
			if (response.ok) {
				const modules = await response.json();
				return modules.filter((module: ModuleType) => !semver.lt(module.version, 'v0.0.1'));
			}
		} catch (error) {
			console.error(`HelmRepository "${helmRepositoryName}": error fetching modules:`, error);
			toast.error(`HelmRepository "${helmRepositoryName}": unable to reach repository`);
		} finally {
			isModuleFetching = false;
		}

		return [] as ModuleType[];
	}

	let releaseResourceVersion: string | undefined = $state(undefined);
	let isReleaseFetching = $state(false);

	async function listReleases() {
		if (isReleaseFetching) return;

		isReleaseFetching = true;

		const releases: HelmToolkitFluxcdIoV2HelmRelease[] = [];

		try {
			let continueToken: string | undefined = undefined;
			do {
				const response = await resourceClient.list({
					cluster,
					namespace: 'otterscale-system',
					group: 'helm.toolkit.fluxcd.io',
					version: 'v2',
					resource: 'helmreleases',
					limit: BigInt(10),
					continue: continueToken
				});

				releaseResourceVersion = response.resourceVersion;
				continueToken = response.continue;

				releases.push(
					...response.items.map((item) => item.object as HelmToolkitFluxcdIoV2HelmRelease)
				);
			} while (continueToken);
		} catch (error) {
			console.error(
				'OtterScale Charts Helm Releases was not found in namespace otterscale-system.:',
				error
			);
			toast.error('OtterScale Charts Helm Releases was not found in namespace otterscale-system.');
		} finally {
			isReleaseFetching = false;
		}

		installedModules = new Set(
			releases.map((release) => release.spec?.chart?.spec.chart).filter(Boolean)
		) as Set<string>;
	}

	let isReleaseWatching = $state(false);
	let watchAbortController: AbortController | null = null;
	async function watchReleases() {
		if (isReleaseFetching || isReleaseWatching || isDestroyed) return;

		isReleaseWatching = true;
		watchAbortController = new AbortController();
		try {
			const stream = resourceClient.watch(
				{
					cluster,
					namespace: 'otterscale-system',
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

				const release = response.resource?.object as HelmToolkitFluxcdIoV2HelmRelease;
				const chartName = release?.spec?.chart?.spec?.chart;

				releaseResourceVersion = release?.metadata?.resourceVersion;

				if (response.type === WatchEvent_Type.ADDED) {
					if (chartName) {
						installedModules = new Set([...installedModules, chartName]);
						rebuildData();
					}
				} else if (response.type === WatchEvent_Type.MODIFIED) {
					// Rebuild to update status etc.
					rebuildData();
				} else if (response.type === WatchEvent_Type.DELETED) {
					if (chartName) {
						const next = new SvelteSet(installedModules);
						next.delete(chartName);
						installedModules = next;
						rebuildData();
					}
				}
			}
		} catch (error) {
			if (watchAbortController.signal.aborted) return;
			console.error('Failed to watch helmreleases:', error);
		} finally {
			if (!isDestroyed) {
				toast.info('Watching installed modules was disconnected.');
			}
			isReleaseWatching = false;
			watchAbortController = null;
		}
	}

	function rebuildData() {
		if (!helmRepository || modules.length === 0) return;
		data = modules
			.filter((module) => module.name.startsWith('otterscale-'))
			.map((module) => getChartData(module, installedModules, helmRepository!));
	}

	async function fetchData() {
		if (!namespace) return;

		helmRepository = await fetchHelmRepository();
		if (!helmRepository) return;

		const fetchedModules = await fetchModules(helmRepository);
		if (!fetchedModules) return;
		modules = fetchedModules;

		await listReleases();
		rebuildData();
	}

	function handleReload() {
		if (!isReleaseWatching) {
			watchReleases();
			return;
		}
		if (watchAbortController) {
			watchAbortController.abort();
		}
	}

	onMount(async () => {
		await fetchData();
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

{#key cluster + namespace}
	{#if data}
		<main class="pb-8">
			<ModuleViewer {cluster} {namespace} modules={data}>
				{#snippet reload()}
					<Button onclick={handleReload} variant="outline" size="icon">
						{#if isReleaseWatching}
							<CableIcon class="size-4" />
						{:else}
							<UnplugIcon class="size-4 text-destructive" />
						{/if}
					</Button>
				{/snippet}
			</ModuleViewer>
		</main>
	{/if}
{/key}

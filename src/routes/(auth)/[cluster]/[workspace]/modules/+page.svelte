<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type {
		HelmToolkitFluxcdIoV2HelmRelease,
		SourceToolkitFluxcdIoV1HelmRepository
	} from '@otterscale/types';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

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
				return await response.json();
			}
		} catch (error) {
			console.error(`HelmRepository "${helmRepositoryName}": error fetching modules:`, error);
			toast.error(`HelmRepository "${helmRepositoryName}": unable to reach repository`);
		} finally {
			isModuleFetching = false;
		}

		return [] as ModuleType[];
	}

	let isReleaseFetching = $state(false);

	async function fetchInstalledModules() {
		if (isReleaseFetching) return;

		isReleaseFetching = true;

		const releases: HelmToolkitFluxcdIoV2HelmRelease[] = [];

		try {
			const response = await resourceClient.list({
				cluster,
				namespace: 'otterscale-system',
				group: 'helm.toolkit.fluxcd.io',
				version: 'v2',
				resource: 'helmreleases'
			});
			releases.push(
				...response.items.map((item) => item.object as HelmToolkitFluxcdIoV2HelmRelease)
			);
		} catch (error) {
			console.error(
				'OtterScale Charts Helm Releases was not found in namespace otterscale-system.:',
				error
			);
			toast.error('OtterScale Charts Helm Releases was not found in namespace otterscale-system.');
		} finally {
			isReleaseFetching = false;
		}
		return new Set(
			releases.map((release) => release.spec?.chart?.spec.chart).filter(Boolean)
		) as Set<string>;
	}

	async function fetchData() {
		if (!namespace) return;

		const helmRepository = await fetchHelmRepository();
		if (!helmRepository) return;

		const modules = await fetchModules(helmRepository);
		if (!modules) return;

		const installedModules = (await fetchInstalledModules()) ?? new Set();
		data = modules
			.filter((module) => module.name.startsWith('otterscale-'))
			.map((module) => getChartData(module, installedModules, helmRepository));
	}

	async function handleReload() {
		await fetchData();
	}

	onMount(async () => {
		await fetchData();
	});
</script>

{#key cluster + namespace}
	{#if data}
		<main class="pb-8">
			<ModuleViewer {cluster} {namespace} modules={data}>
				{#snippet reload()}
					<Button onclick={handleReload} disabled={isModuleFetching} variant="outline">
						<RefreshCwIcon />
					</Button>
				{/snippet}
			</ModuleViewer>
		</main>
	{/if}
{/key}

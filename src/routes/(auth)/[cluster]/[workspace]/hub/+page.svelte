<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArtifactViewer } from '$lib/components/artifact-viewer';
	import {
		type ChartAttribute,
		getChartDataFromHarbor,
		getChartDataFromIndex
	} from '$lib/components/artifact-viewer/table-layout';
	import type { ArtifactChartType } from '$lib/components/artifact-viewer/types';
	import {
		encodeHarborURIComponent,
		parseHarborHost,
		parseHarborProjectName
	} from '$lib/components/artifact-viewer/utils.svelte.ts';
	import Button from '$lib/components/ui/button/button.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.application_hub(),
			url: resolve('/(auth)/[cluster]/[workspace]/hub', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(page.data.namespace ?? '');

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let charts: Record<ChartAttribute, JsonValue>[] = $state([]);

	async function fetchChartsByHelmRepository(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	) {
		const fromHarbor =
			lodash.get(helmRepository, ['metadata', 'labels', 'tenant.otterscale.io/from-harbor']) ===
			'true';
		const helmRepositoryName = helmRepository.metadata?.name ?? '';
		const repositoryUrl = helmRepository.spec?.url ?? '';
		const secretName = helmRepository.spec?.secretRef?.name ?? '';

		try {
			let chartsByHelmRepository: Record<ChartAttribute, JsonValue>[] = [];

			if (fromHarbor) {
				const harborHost = parseHarborHost(helmRepository);
				const harborProjectName = parseHarborProjectName(helmRepository);
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

				if (response.ok) {
					const artifactCharts: ArtifactChartType[] = await response.json();
					chartsByHelmRepository = artifactCharts.map((artifactChart) =>
						getChartDataFromHarbor(artifactChart, helmRepository)
					);
				}
			} else {
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
					const charts: any[] = await response.json();
					chartsByHelmRepository = charts.map((chart) =>
						getChartDataFromIndex(chart, helmRepository)
					);
				}
			}

			charts = [...charts, ...chartsByHelmRepository];
		} catch (error) {
			console.error(`HelmRepository "${helmRepositoryName}": error fetching charts:`, error);
			toast.error(`HelmRepository "${helmRepositoryName}": unable to reach repository`);
		}
	}

	let isFetching = $state(false);

	async function fetchCharts() {
		if (isFetching || !namespace) return;

		isFetching = true;
		charts = [];

		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				resource: 'helmrepositories'
			} as ListRequest);

			const helmRepositories: (SourceToolkitFluxcdIoV1HelmRepository | undefined)[] =
				response.items.map((item) => item.object);

			if (helmRepositories.length === 0) {
				toast.info('No HelmRepository resources found in this namespace');
				isFetching = false;
				return;
			}

			helmRepositories.forEach((helmRepository) => {
				if (helmRepository) {
					fetchChartsByHelmRepository(helmRepository);
					isFetching = false;
				}
			});
		} catch (error) {
			console.error('Failed to list HelmRepositories:', error);
			toast.error('Failed to list HelmRepository resources');
			isFetching = false;
		}
	}

	function handleReload() {
		fetchCharts();
	}

	let isMounted = $state(false);
	onMount(() => {
		if (!namespace) return;
		fetchCharts();
		isMounted = true;
	});
</script>

{#key cluster + namespace}
	{#if isMounted}
		<ArtifactViewer {cluster} {namespace} {charts}>
			{#snippet reload()}
				<Button onclick={handleReload} disabled={isFetching} variant="outline">
					<RefreshCwIcon />
				</Button>
			{/snippet}
		</ArtifactViewer>
	{/if}
{/key}

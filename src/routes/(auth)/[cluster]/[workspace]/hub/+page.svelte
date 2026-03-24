<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { RefreshCwIcon } from '@lucide/svelte';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
	import lodash from 'lodash';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArtifactViewer } from '$lib/components/artifact-viewer';
	import {
		type ArtifactAttribute,
		getArtifactData
	} from '$lib/components/artifact-viewer/table-layout';
	import { createHelmRepositoryChartArtifact } from '$lib/components/artifact-viewer/types';
	import {
		encodeURIComponentWithSlashEscape,
		parseHarborHost,
		parseProjectName
	} from '$lib/components/artifact-viewer/utils.svelte.ts';
	import Button from '$lib/components/ui/button/button.svelte';
	import { m } from '$lib/paraglide/messages';
	import type { ArtifactType } from '$lib/server/harbor';
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

	let charts: Record<ArtifactAttribute, JsonValue>[] = $state([]);

	async function fetchChartsByHelmRepository(
		helmRepository: SourceToolkitFluxcdIoV1HelmRepository
	) {
		const fromHarbor = lodash.get(helmRepository, [
			'metadata',
			'labels',
			'tenant.otterscale.io/from-harbor'
		]);
		const helmRepositoryName = helmRepository.metadata?.name ?? 'unknown';
		const repositoryUrl = helmRepository.spec?.url ?? '';
		const secretName = helmRepository.spec?.secretRef?.name ?? '';

		try {
			let data: Record<ArtifactAttribute, JsonValue>[] = [];

			if (fromHarbor) {
				const isInternal =
					helmRepository.metadata?.labels?.['tenant.otterscale.io/internal'] === 'true';
				const harborHost = parseHarborHost(helmRepository);
				const projectName = parseProjectName(helmRepository);
				const artifactsUrl = `/api/v2.0/projects/${encodeURIComponentWithSlashEscape(projectName)}/artifacts?q=media_type=${encodeURIComponentWithSlashEscape('application/vnd.cncf.helm.config.v1+json')}&latest_in_repository=true`;
				const response = await fetch('/bff/harbor/proxy', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						cluster,
						namespace,
						harborHost,
						secretName,
						isInternal,
						apiPath: artifactsUrl
					})
				});
				if (!response.ok) {
					throw new Error(`Harbor API error: ${response.status} ${response.statusText}`);
				}

				const artifacts: ArtifactType[] = await response.json();
				data = artifacts.map((artifact) => getArtifactData(artifact, helmRepository));
			} else if (helmRepository.spec?.type !== 'oci' && repositoryUrl) {
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
				if (!response.ok) {
					throw new Error(`Helm repository index error: ${response.status} ${response.statusText}`);
				}

				const payload = (await response.json()) as {
					entries: Array<{
						chartName: string;
						latest: {
							name: string;
							version: string;
							appVersion?: string;
							created?: string;
							description?: string;
							digest?: string;
							home?: string;
							icon?: string;
							urls: string[];
							raw?: Record<string, unknown>;
						};
						versions: Array<{
							name: string;
							version: string;
							appVersion?: string;
							created?: string;
							description?: string;
							digest?: string;
							home?: string;
							icon?: string;
							urls: string[];
						}>;
					}>;
				};

				data = payload.entries.map((entry) =>
					getArtifactData(
						createHelmRepositoryChartArtifact(
							entry.chartName,
							entry.latest,
							entry.versions,
							entry.latest.raw
						),
						helmRepository
					)
				);
			}

			charts = [...charts, ...data];
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
			const validHelmRepositories = helmRepositories.filter(
				(item): item is SourceToolkitFluxcdIoV1HelmRepository => Boolean(item)
			);

			if (validHelmRepositories.length === 0) {
				toast.info('No HelmRepository resources found in this namespace');
				isFetching = false;
				return;
			}

			await Promise.allSettled(
				validHelmRepositories.map((helmRepository) => fetchChartsByHelmRepository(helmRepository))
			);
			isFetching = false;
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

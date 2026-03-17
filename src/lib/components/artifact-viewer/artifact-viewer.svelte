<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { Columns3Icon, EraserIcon, RefreshCwIcon } from '@lucide/svelte';
	import { type ListRequest, ResourceService } from '@otterscale/api/resource/v1';
	import type { ColumnDef } from '@tanstack/table-core';
	import lodash from 'lodash';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import type { ArtifactType } from '$lib/server/harbor';

	import {
		type ArtifactAttribute,
		getArtifactColumnDefinitions,
		getArtifactData,
		getArtifactDataSchemas,
		getArtifactUISchemas
	} from './artifact-viewer.ts';
	import Grid from './grid.svelte';
	import UploadCommand from './upload-command.svelte';
	import { encodeURIComponentWithSlashEscape } from './utils.svelte';
	import View from './view.svelte';

	let { cluster, namespace }: { cluster: string; namespace: string } = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	

	function getProjectName(helmRepository: any): string {
		const helmRepositoryName = lodash.get(helmRepository, 'metadata.name');

		const url = new URL(lodash.get(helmRepository, 'spec.url', ''));
		if (!url) {
			throw new Error(`HelmRepository "${helmRepositoryName}": invalid URL "${url}"`);
		}
		const project = lodash.trim(url.pathname, '/');

		return project;
	}

	

	let dataset: Record<ArtifactAttribute, JsonValue>[] = $state([]);
	async function fetchChartsByHelmRepository(helmRepository: any) {
		const fromHarbor = lodash.get(
			helmRepository,
			['metadata', 'labels', 'tenant.otterscale.io/from-harbor'],
			'unknown'
		);

		// Only support Harbor HelmRepository temporarily.
		if (!fromHarbor) return;

		const helmRepositoryName = lodash.get(helmRepository, 'metadata.name', 'unknown');

		const projectName = getProjectName(helmRepository);
		try {
			const encodedProject = encodeURIComponentWithSlashEscape(projectName);
			const mediaTypeQuery = encodeURIComponentWithSlashEscape('media_type=application/vnd.cncf.helm.config.v1+json');
			const artifactsUrl = `/api/v2.0/projects/${encodedProject}/artifacts?q=${mediaTypeQuery}&latest_in_repository=true`;
			const response = await fetch('/bff/harbor/proxy', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster,
					namespace,
					helmRepositoryName,
					apiPath: artifactsUrl
				})
			});
			if (!response.ok) {
				throw new Error(`Harbor API error: ${response.status} ${response.statusText}`);
			}

			const artifacts: ArtifactType[] = await response.json();

			const data = artifacts.map((artifact) => getArtifactData(artifact, helmRepository));

			dataset = [...dataset, ...data];
		} catch (error) {
			console.error(`HelmRepository "${helmRepositoryName}": error fetching charts:`, error);
			toast.error(
				`HelmRepository "${helmRepositoryName}": unable to reach repository`
			);
		}
	}

	const uiSchemas: Record<string, UISchemaType> = getArtifactUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getArtifactDataSchemas();
	const columnDefinitions: ColumnDef<Record<ArtifactAttribute, JsonValue>>[] = getArtifactColumnDefinitions(
		uiSchemas,
		dataSchemas
	);

	let isFetching = $state(false);

	async function fetchCharts() {
		if (isFetching || !namespace) return;

		isFetching = true;
		dataset = [];

		try {
			const response = await resourceClient.list({
				cluster,
				namespace,
				group: 'source.toolkit.fluxcd.io',
				version: 'v1',
				resource: 'helmrepositories'
			} as ListRequest);

			const helmRepositories = response.items.map((item) => item.object);

			if (helmRepositories.length === 0) {
				toast.info('No HelmRepository resources found in this namespace');
				isFetching = false;
				return;
			}

			let pendings = helmRepositories.length;
			for (const helmRepository of helmRepositories) {
				fetchChartsByHelmRepository(helmRepository).finally(() => {
					pendings = pendings - 1;
					if (pendings === 0) {
						isFetching = false;
					}
				});
			}
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

{#if isMounted}
	<div class="space-y-4">
		<div class="flex items-end justify-between gap-4">
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Hub</Item.Title>
					<Item.Description class="text-base">{cluster} {namespace}</Item.Description>
				</Item.Content>
			</Item.Root>
		</div>
		<DynamicTable {dataset} {columnDefinitions} {uiSchemas}>
			{#snippet gridsLayout({ table, handleClear })}
				{#if table.getRowModel().rows?.length}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{#each table.getRowModel().rows as row (row.id)}
							<Grid
								{row}
								{cluster}
								{namespace}
							/>
						{/each}
					</div>
				{:else}
					<Empty.Root class="rounded-lg bg-muted">
						<Empty.Header>
							<Empty.Media variant="icon">
								<Columns3Icon size={32} class="opacity-60" aria-hidden="true" />
							</Empty.Media>
							<Empty.Title>No Resources Found</Empty.Title>
							<Empty.Description>
								No resources found. Please adjust your filters or initiate a new resource to
								populate this table.
							</Empty.Description>
						</Empty.Header>
						<Empty.Content>
							<Button onclick={handleClear}>
								<EraserIcon size={16} class="opacity-60" />
								Reset
							</Button>
						</Empty.Content>
					</Empty.Root>
				{/if}
			{/snippet}
			{#snippet create()}
				<UploadCommand />
			{/snippet}
			{#snippet reload()}
				<Button onclick={handleReload} disabled={isFetching} variant="outline">
					<RefreshCwIcon class="opacity-60" size={16} />
				</Button>
			{/snippet}
			{#snippet rowActions({ row })}
				{@const artifact = row.original.raw as JsonValue}
				<View data={artifact} />
			{/snippet}
		</DynamicTable>
	</div>
{/if}

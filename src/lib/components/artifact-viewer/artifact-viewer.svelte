<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { Columns3Icon, EraserIcon, RefreshCwIcon } from '@lucide/svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { onMount } from 'svelte';
	import { SvelteURL } from 'svelte/reactivity';
	import { toast } from 'svelte-sonner';

	import { env as publicEnv } from '$env/dynamic/public';
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
	import View from './view.svelte';

	let { cluster, namespace }: { cluster: string; namespace: string } = $props();

	const uiSchemas: Record<string, UISchemaType> = getArtifactUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getArtifactDataSchemas();
	const columnDefinitions: ColumnDef<Record<string, JsonValue>>[] = getArtifactColumnDefinitions(
		uiSchemas,
		dataSchemas
	);

	let latestRepositoryChartArtifacts: Record<ArtifactAttribute, JsonValue>[] = $state([]);
	let isFetchingArtifacts = $state(false);

	async function fetchLatestArtifacts(namespace: string) {
		if (isFetchingArtifacts || !namespace) return;

		isFetchingArtifacts = true;

		try {
			const response = await fetch(`/rest/harbor/all-latest-artifacts?project=${namespace}`);
			if (!response.ok) {
				console.error(
					'Failed to fetch latest chart artifact of each repository:',
					response.statusText
				);
				toast.error('Failed to fetch latest chart artifact of each repository');
				return;
			}
			const data: ArtifactType[] = await response.json();
			latestRepositoryChartArtifacts = (data ?? []).map((artifact) => getArtifactData(artifact));
			return latestRepositoryChartArtifacts;
		} catch (error) {
			console.error('Error fetching latest chart artifact of each repository:', error);
			toast.error('Error fetching latest chart artifact of each repository');
		} finally {
			isFetchingArtifacts = false;
		}
	}

	function handleReload() {
		if (!namespace) return;

		fetchLatestArtifacts(namespace);
	}

	let isMounted = $state(false);
	onMount(async () => {
		if (!namespace) return;
		await fetchLatestArtifacts(namespace);

		isMounted = true;
	});
</script>

{#if isMounted}
	<div class="space-y-4">
		<div class="flex items-end justify-between gap-4">
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					{@const harborUniformResourceLocator = new SvelteURL(publicEnv.PUBLIC_HARBOR_URL ?? '')}
					<Item.Title class="text-xl font-bold">Hub</Item.Title>
					<Item.Description class="text-base"
						>{harborUniformResourceLocator.host} in {cluster} {namespace}</Item.Description
					>
				</Item.Content>
			</Item.Root>
		</div>
		<DynamicTable
			dataset={latestRepositoryChartArtifacts}
			{columnDefinitions}
			{uiSchemas}
			{dataSchemas}
		>
			{#snippet gridsLayout({ table, handleClear })}
				{#if table.getRowModel().rows?.length}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{#each table.getRowModel().rows as row (row.id)}
							{@const latestChartArtifact = row.original.raw as unknown as ArtifactType}
							<Grid {latestChartArtifact} {cluster} {namespace} />
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
				<Button onclick={handleReload} disabled={isFetchingArtifacts} variant="outline">
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

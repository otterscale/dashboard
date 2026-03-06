<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { RefreshCwIcon } from '@lucide/svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';

	import {
		getArtifactColumnDefinitions,
		getArtifactData,
		getArtifactDataSchemas,
		getArtifactUISchemas
	} from './artifact-viewer.ts';
	import Create from './create.svelte';
	import Grid from './grid.svelte';
	import type { ArtifactType, ProjectType, RepositoryType } from './types';

	let { project, repository }: { project: ProjectType; repository: RepositoryType } = $props();

	const uiSchemas: Record<string, UISchemaType> = getArtifactUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getArtifactDataSchemas();
	const columnDefinitions: ColumnDef<Record<string, JsonValue>>[] = getArtifactColumnDefinitions(
		uiSchemas,
		dataSchemas
	);

	let dataset: Record<string, JsonValue>[] = $state([]);
	let isFetchingArtifacts = $state(false);

	async function fetchArtifacts() {
		if (isFetchingArtifacts || !project || !repository) return;

		const repoName = repository.name.includes('/')
			? repository.name.slice(repository.name.indexOf('/') + 1)
			: repository.name;

		isFetchingArtifacts = true;
		try {
			const response = await fetch(
				`/rest/harbor/artifacts?project=${encodeURIComponent(project.name)}&repository=${encodeURIComponent(repoName)}`
			);
			if (!response.ok) {
				console.error('Failed to fetch Harbor artifacts:', response.statusText);
				toast.error('Failed to fetch Harbor artifacts');
				return;
			}
			const data: ArtifactType[] = await response.json();
			dataset = (data ?? []).map((artifact) => getArtifactData(artifact));
		} catch (error) {
			console.error('Error fetching Harbor artifacts:', error);
			toast.error('Error fetching Harbor artifacts');
		} finally {
			isFetchingArtifacts = false;
		}
	}

	function handleListing() {
		if (!isFetchingArtifacts) {
			fetchArtifacts();
		}
	}

	let isMounted = $state(false);
	onMount(async () => {
		await fetchArtifacts();
		isMounted = true;
	});
</script>

{#if isMounted}
	{#if columnDefinitions}
		<DynamicTable {dataset} {columnDefinitions} {uiSchemas} {dataSchemas}>
			{#snippet grid({ row })}
				{@const artifact = row.original.raw as unknown as ArtifactType}
				<Grid {project} {repository} {artifact} />
			{/snippet}
			{#snippet create()}
				<Create />
			{/snippet}
			{#snippet reload()}
				<Button onclick={handleListing} disabled={isFetchingArtifacts} variant="outline">
					<RefreshCwIcon class="opacity-60" size={16} />
				</Button>
			{/snippet}
			{#snippet rowActions()}{/snippet}
		</DynamicTable>
	{/if}
{/if}

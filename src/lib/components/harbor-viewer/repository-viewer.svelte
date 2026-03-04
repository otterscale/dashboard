<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { LoaderCircleIcon, RefreshCwIcon } from '@lucide/svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';

	import HarborViewerPicker from './repository-viewer-picker.svelte';
	import {
		getRepositoryColumnDefinitions,
		getRepositoryData,
		getRepositoryDataSchemas,
		getRepositoryUISchemas
	} from './repository-viewer.ts';
	import { listRepositories, type ProjectType, type RepositoryType } from '$lib/server/harbor.ts';

	let timer: ReturnType<typeof setInterval> | null = null;
	let isDestroyed = false;

	function startAutoReload() {
		stopAutoReload();
		timer = setInterval(() => {
			if (!isDestroyed && selectedProject) {
				fetchRepositories(selectedProject);
			}
		}, 15_000);
	}

	function stopAutoReload() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}

	let projects = $state<ProjectType[]>([]);
	let selectedProject = $state<string | undefined>(undefined);

	async function fetchProjects() {
		try {
			const response = await fetch('/rest/harbor/projects');
			if (!response.ok) {
				console.error('Failed to fetch Harbor projects:', response.statusText);
				toast.error('Failed to fetch Harbor projects');
				return;
			}
			const data: ProjectType[] = await response.json();
			projects = data ?? [];

			// Default to first project
			if (!selectedProject && projects.length > 0) {
				selectedProject = projects[0]?.name;
			}
		} catch (error) {
			console.error('Error fetching Harbor projects:', error);
			toast.error('Error fetching Harbor projects');
		}
	}

	function handleProjectSelect() {
		dataset = [];
		if (selectedProject) {
			fetchRepositories(selectedProject);
		}
	}

	const uiSchemas: Record<string, UISchemaType> = getRepositoryUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getRepositoryDataSchemas();

	let dataset: Record<string, JsonValue>[] = $state([]);
	let columnDefinitions: ColumnDef<Record<string, JsonValue>>[] | undefined = $state(undefined);

	let isFetching = $state(false);

	async function fetchRepositories(projectName: string) {
		if (isFetching || isDestroyed || !projectName) return;

		isFetching = true;
		try {
			const repositories: RepositoryType[] = await listRepositories(projectName);
			dataset = (repositories ?? []).map((repository) => getRepositoryData(repository));
		} catch (error) {
			console.error('Error fetching Harbor repositories:', error);
			toast.error('Error fetching Harbor repositories');
		} finally {
			isFetching = false;
		}
	}

	let isMounted = $state(false);

	onMount(async () => {
		await fetchProjects();
		if (selectedProject) {
			await fetchRepositories(selectedProject);
		}
		columnDefinitions = getRepositoryColumnDefinitions(uiSchemas, dataSchemas);
		startAutoReload();
		isMounted = true;
	});

	onDestroy(() => {
		isDestroyed = true;
		stopAutoReload();
	});

	function handleReload() {
		if (selectedProject && !isFetching) {
			fetchRepositories(selectedProject);
		}
	}
</script>

{#if isMounted}
	{#if columnDefinitions}
		<DynamicTable {dataset} {columnDefinitions} {uiSchemas} {dataSchemas}>
			{#snippet create()}
				<HarborViewerPicker
					bind:value={selectedProject}
					{projects}
					onSelect={handleProjectSelect}
				/>
			{/snippet}
			{#snippet reload()}
				<Button onclick={handleReload} disabled={isFetching} variant="outline">
					{#if isFetching}
						<LoaderCircleIcon class="animate-spin opacity-60" size={16} />
					{:else}
						<RefreshCwIcon class="opacity-60" size={16} />
					{/if}
				</Button>
			{/snippet}
			{#snippet rowActions({ row })}
				{row}
			{/snippet}
		</DynamicTable>
	{/if}
{/if}

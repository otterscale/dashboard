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
	import { ProjectPicker, RepositoryPicker } from './index.ts';
	import type { ArtifactType, ProjectType, RepositoryType } from './types';
	import View from './view.svelte';

	let projects = $state<ProjectType[]>([]);
	let selectedProject = $state<ProjectType | undefined>(undefined);

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
			if (projects.length > 0) {
				[selectedProject] = projects;
			}
		} catch (error) {
			console.error('Error fetching Harbor projects:', error);
			toast.error('Error fetching Harbor projects');
		}
	}

	function handleProjectSelect() {
		if (selectedProject) {
			fetchRepositories(selectedProject.name);
		}
	}

	let repositories = $state<RepositoryType[]>([]);
	let selectedRepository = $state<RepositoryType | undefined>(undefined);

	async function fetchRepositories(projectName: string) {
		if (!projectName) return;
		try {
			const response = await fetch(
				`/rest/harbor/repositories?project=${encodeURIComponent(projectName)}`
			);
			if (!response.ok) {
				console.error('Failed to fetch Harbor repositories:', response.statusText);
				toast.error('Failed to fetch Harbor repositories');
				return;
			}
			const data: RepositoryType[] = await response.json();
			repositories = data ?? [];
			if (repositories.length > 0) {
				[selectedRepository] = repositories;
				fetchArtifacts(selectedRepository.name);
			} else {
				dataset = [];
			}
		} catch (error) {
			console.error('Error fetching Harbor repositories:', error);
			toast.error('Error fetching Harbor repositories');
		}
	}

	function handleRepositorySelect() {
		if (selectedProject && selectedRepository) {
			fetchArtifacts(selectedRepository.name);
		}
	}

	const uiSchemas: Record<string, UISchemaType> = getArtifactUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getArtifactDataSchemas();
	const columnDefinitions: ColumnDef<Record<string, JsonValue>>[] = getArtifactColumnDefinitions(
		uiSchemas,
		dataSchemas
	);

	let dataset: Record<string, JsonValue>[] = $state([]);
	let isFetchingArtifacts = $state(false);

	async function fetchArtifacts(repositoryNameWithProject: string) {
		if (isFetchingArtifacts || !repositoryNameWithProject) return;

		const [projectName, repositoryName] = repositoryNameWithProject.split('/');

		isFetchingArtifacts = true;
		isFetchingArtifacts = true;
		try {
			const response = await fetch(
				`/rest/harbor/artifacts?project=${encodeURIComponent(projectName)}&repository=${encodeURIComponent(repositoryName)}`
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
			isFetchingArtifacts = false;
		}
	}

	function handleListing() {
		if (selectedProject && selectedRepository && !isFetchingArtifacts) {
			fetchArtifacts(selectedRepository.name);
		}
	}

	let isMounted = $state(false);
	onMount(async () => {
		await fetchProjects();
		if (selectedProject) {
			await fetchRepositories(selectedProject.name);
			if (selectedRepository) {
				await fetchArtifacts(selectedRepository.name);
			}
		}
		isMounted = true;
	});
</script>

{#if isMounted}
	<div class="space-y-4">
		<div class="flex items-center gap-2">
			<ProjectPicker bind:value={selectedProject} {projects} onSelect={handleProjectSelect} />
			{#if repositories.length > 0}
				<RepositoryPicker
					bind:value={selectedRepository}
					{repositories}
					onSelect={handleRepositorySelect}
				/>
			{/if}
		</div>
		<DynamicTable {dataset} {columnDefinitions} {uiSchemas} {dataSchemas}>
			{#snippet grid({ row })}
				{@const artifact = row.original.raw as unknown as ArtifactType}
				<Grid {artifact} />
			{/snippet}
			{#snippet create()}
				<Create />
			{/snippet}
			{#snippet reload()}
				<Button onclick={handleListing} disabled={isFetchingArtifacts} variant="outline">
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

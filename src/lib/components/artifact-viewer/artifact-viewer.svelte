<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { RefreshCwIcon } from '@lucide/svelte';
	import type { ColumnDef } from '@tanstack/table-core';
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
	import View from './view.svelte';
	import ProjectPicker from './artifact-viewer-project-picker.svelte';
	import RepositoryPicker from './artifact-viewer-repository-picker.svelte';
	import { onMount } from 'svelte';

	const uiSchemas: Record<string, UISchemaType> = getArtifactUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getArtifactDataSchemas();
	const columnDefinitions: ColumnDef<Record<string, JsonValue>>[] = getArtifactColumnDefinitions(
		uiSchemas,
		dataSchemas
	);

	let projects = $state<ProjectType[]>([]);
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
		} catch (error) {
			console.error('Error fetching Harbor projects:', error);
			toast.error('Error fetching Harbor projects');
		}
	}

	let selectedProject = $state<ProjectType | undefined>(undefined);
	function handleProjectSelect(project: ProjectType) {
		selectedProject = project;
	}
	$effect(() => {
		selectedProject = projects.length > 0 ? projects[0] : undefined;
	});
	$effect(() => {
		if (selectedProject) {
			fetchRepositories(selectedProject.name);
		} else {
			repositories = [];
		}
	});

	let repositories = $state<RepositoryType[]>([]);
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
		} catch (error) {
			console.error('Error fetching Harbor repositories:', error);
			toast.error('Error fetching Harbor repositories');
		}
	}

	let selectedRepository = $state<RepositoryType | undefined>(undefined);
	function handleRepositorySelect(repository: RepositoryType) {
		selectedRepository = repository;
	}
	$effect(() => {
		selectedRepository = repositories.length > 0 ? repositories[0] : undefined;
	});
	$effect(() => {
		if (selectedRepository) {
			fetchArtifacts(selectedRepository.name);
		} else {
			dataset = [];
		}
	});

	let dataset: Record<string, JsonValue>[] = $state([]);
	let isFetchingArtifacts = $state(false);
	async function fetchArtifacts(repositoryNameWithProject: string) {
		if (isFetchingArtifacts || !repositoryNameWithProject) return;

		isFetchingArtifacts = true;

		const [projectName, repositoryName] = repositoryNameWithProject.split('/');
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
		}
	}
	function handleReload() {
		if (selectedProject && selectedRepository && !isFetchingArtifacts) {
			fetchArtifacts(selectedRepository.name);
		}
	}

	let isMounted = $state(false);
	onMount(() => {
		fetchProjects().then(() => {
			isMounted = true;
		});
		return () => {};
	});
</script>

{#if isMounted}
	<div class="space-y-4">
		<div class="flex items-center gap-2">
			<ProjectPicker value={selectedProject} {projects} onSelect={handleProjectSelect} />
			{#if repositories.length > 0}
				<RepositoryPicker
					value={selectedRepository}
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

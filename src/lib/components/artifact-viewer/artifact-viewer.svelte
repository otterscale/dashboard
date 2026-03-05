<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { LoaderCircleIcon, RefreshCwIcon } from '@lucide/svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { onDestroy, onMount } from 'svelte';
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
	import ProjectPicker from './artifact-viewer-project-picker.svelte';
	import RepositoryPicker from './artifact-viewer-repository-picker.svelte';
	import Grid from './grid.svelte';
	import type { ArtifactType, ProjectType, RepositoryType } from './types';

	let timer: ReturnType<typeof setInterval> | null = null;
	function startWatching() {
		stopWatching();
		timer = setInterval(() => {
			if (!isDestroyed && selectedProject && selectedRepository) {
				fetchArtifacts(selectedProject.name, selectedRepository.name);
			}
		}, 15_000);
	}
	function stopWatching() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
	}
	function handleWatching() {
		if (selectedProject && selectedRepository && !isListing) {
			fetchArtifacts(selectedProject.name, selectedRepository.name);
		}
		startWatching();
	}

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
		// Reset downstream state
		repositories = [];
		selectedRepository = undefined;
		dataset = [];
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
				fetchArtifacts(projectName, selectedRepository!.name);
			} else {
				selectedRepository = undefined;
				dataset = [];
			}
		} catch (error) {
			console.error('Error fetching Harbor repositories:', error);
			toast.error('Error fetching Harbor repositories');
		}
	}

	function handleRepositorySelect() {
		dataset = [];
		if (selectedProject && selectedRepository) {
			fetchArtifacts(selectedProject.name, selectedRepository.name);
		}
	}

	const uiSchemas: Record<string, UISchemaType> = getArtifactUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getArtifactDataSchemas();
	const columnDefinitions: ColumnDef<Record<string, JsonValue>>[] = getArtifactColumnDefinitions(
		uiSchemas,
		dataSchemas
	);

	let dataset: Record<string, JsonValue>[] = $state([]);
	let isListing = $state(false);

	async function fetchArtifacts(projectName: string, repositoryFullName: string) {
		if (isListing || isDestroyed || !projectName || !repositoryFullName) return;

		// Harbor API expects repo name without the project prefix
		const repoName = repositoryFullName.includes('/')
			? repositoryFullName.slice(repositoryFullName.indexOf('/') + 1)
			: repositoryFullName;

		isListing = true;
		try {
			const response = await fetch(
				`/rest/harbor/artifacts?project=${encodeURIComponent(projectName)}&repository=${encodeURIComponent(repoName)}`
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
			isListing = false;
		}
	}

	let isMounted = $state(false);
	onMount(async () => {
		await fetchProjects();
		if (selectedProject) {
			await fetchRepositories(selectedProject.name);
			if (selectedRepository) {
				await fetchArtifacts(selectedProject.name, selectedRepository.name);
			}
		}
		startWatching();
		isMounted = true;
	});

	let isDestroyed = false;
	onDestroy(() => {
		isDestroyed = true;
		stopWatching();
	});
</script>

{#if isMounted}
	{#if columnDefinitions}
		<div class="space-y-4">
			<div class="flex items-center gap-2">
				<ProjectPicker bind:value={selectedProject} {projects} onSelect={handleProjectSelect} />
				<RepositoryPicker
					bind:value={selectedRepository}
					{repositories}
					onSelect={handleRepositorySelect}
				/>
			</div>
			<DynamicTable {dataset} {columnDefinitions} {uiSchemas} {dataSchemas}>
				{#snippet grid({ row })}
					{@const artifact = row.original.raw as unknown as ArtifactType}
					<Grid {artifact} />
				{/snippet}
				{#snippet create()}{/snippet}
				{#snippet reload()}
					<Button onclick={handleWatching} disabled={isListing} variant="outline">
						{#if isListing}
							<LoaderCircleIcon class="animate-spin opacity-60" size={16} />
						{:else}
							<RefreshCwIcon class="opacity-60" size={16} />
						{/if}
					</Button>
				{/snippet}
				{#snippet rowActions()}{/snippet}
			</DynamicTable>
		</div>
	{/if}
{/if}

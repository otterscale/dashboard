<script lang="ts">
	import * as Item from '$lib/components/ui/item';
	import type { JsonValue } from '@bufbuild/protobuf';
	import { Columns3Icon, EraserIcon, RefreshCwIcon } from '@lucide/svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';

	import ProjectPicker from './artifact-viewer-project-picker.svelte';
	import RepositoryPicker from './artifact-viewer-repository-picker.svelte';
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
			return projects;
		} catch (error) {
			console.error('Error fetching Harbor projects:', error);
			toast.error('Error fetching Harbor projects');
		}
	}

	let selectedProject = $derived(projects.length > 0 ? projects[0] : undefined);
	async function handleProjectSelect(project: ProjectType) {
		selectedProject = project;
		await fetchRepositories(selectedProject.name);
		if (selectedRepository) {
			await fetchArtifacts(selectedRepository.name);
		} else {
			artifacts = [];
		}
	}

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
			return repositories;
		} catch (error) {
			console.error('Error fetching Harbor repositories:', error);
			toast.error('Error fetching Harbor repositories');
		}
	}

	let selectedRepository = $derived(repositories.length > 0 ? repositories[0] : undefined);
	async function handleRepositorySelect(repository: RepositoryType) {
		selectedRepository = repository;
		if (selectedRepository) {
			await fetchArtifacts(selectedRepository.name);
		} else {
			artifacts = [];
		}
	}

	let artifacts: Record<string, JsonValue>[] = $state([]);
	let isFetchingArtifacts = $state(false);
	async function fetchArtifacts(repositoryNameWithProject: string) {
		if (isFetchingArtifacts || !repositoryNameWithProject) return;

		isFetchingArtifacts = true;

		const [projectName, ...repositoryName] = repositoryNameWithProject.split('/');
		try {
			const response = await fetch(
				`/rest/harbor/artifacts?project=${encodeURIComponent(projectName)}&repository=${encodeURIComponent(repositoryName.join('/'))}`
			);
			if (!response.ok) {
				console.error('Failed to fetch Harbor artifacts:', response.statusText);
				toast.error('Failed to fetch Harbor artifacts');
				return;
			}
			const data: ArtifactType[] = await response.json();
			artifacts = (data ?? []).map((artifact) => getArtifactData(artifact));
			return artifacts;
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
	onMount(async () => {
		await fetchProjects();
		if (selectedProject) {
			await fetchRepositories(selectedProject.name);
		}
		if (selectedRepository) {
			await fetchArtifacts(selectedRepository.name);
		}
		isMounted = true;
	});
</script>

{#if isMounted}
	<div class="space-y-4">
		<div class="flex items-end justify-between gap-4">
			<Item.Root class="p-0">
				<Item.Content class="text-left">
					<Item.Title class="text-xl font-bold">Hub</Item.Title>
					<Item.Description class="text-base">harbor</Item.Description>
				</Item.Content>
			</Item.Root>
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
		</div>
		<DynamicTable dataset={artifacts} {columnDefinitions} {uiSchemas} {dataSchemas}>
			{#snippet gridsLayout({ table, handleClear })}
				{#if table.getRowModel().rows?.length}
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
						{#each table.getRowModel().rows as row (row.id)}
							{@const artifact = row.original.raw as unknown as ArtifactType}
							<Grid {artifact} />
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

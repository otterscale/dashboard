<script lang="ts" module>
	import type { PageData } from './$types';

	interface RegistryPageData extends PageData {
		projects: ProjectType[];
		repositories: RepositoryType[];
		selectedProject?: ProjectType;
		selectedRepository?: RepositoryType;
	}
</script>

<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import {
		ArtifactViewer,
		ProjectPicker,
		RepositoryPicker,
		type ProjectType,
		type RepositoryType
	} from '$lib/components/artifact-viewer';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';
	import { toast } from 'svelte-sonner';

	breadcrumbs.set([
		{
			title: m.registry(),
			url: resolve('/(auth)/registry')
		}
	]);

	let { data }: { data: RegistryPageData } = $props();

	const projects = $derived(data.projects ?? []);

	let repositories = $state<RepositoryType[]>([]);
	let selectedProject = $state<ProjectType | undefined>(undefined);
	let selectedRepository = $state<RepositoryType | undefined>(undefined);
	$effect(() => {
		repositories = data.repositories ?? [];
		selectedProject = data.selectedProject;
		selectedRepository = data.selectedRepository;
	});

	let isFetchingRepositories = $state(false);
	async function handleProjectSelect() {
		if (!selectedProject) return;

		isFetchingRepositories = true;

		repositories = [];
		selectedRepository = undefined;
		try {
			const response = await fetch(
				`/rest/harbor/repositories?project=${encodeURIComponent(selectedProject.name)}`
			);

			if (!response.ok) {
				console.error('Failed to fetch Harbor repositories:', response.statusText);
				toast.error('Failed to fetch Harbor repositories');
				return;
			}

			const data: RepositoryType[] = await response.json();
			repositories = data ?? [];
			
			if (repositories.length > 0) {
				selectedRepository = repositories[0];
			}

			const url = new URL(page.url);
			url.searchParams.set('project', selectedProject.name);
			if (selectedRepository) {
				url.searchParams.set('repository', selectedRepository.name);
			} else {
				url.searchParams.delete('repository');
			}
			window.history.replaceState({}, '', url.toString());
		} catch (error) {
			console.error('Error fetching Harbor repositories:', error);
			toast.error('Error fetching Harbor repositories');
		} finally {
			isFetchingRepositories = false;
		}
	}

	function handleRepositorySelect() {
		if (!selectedProject || !selectedRepository) return;

		const url = new URL(page.url);
		url.searchParams.set('project', selectedProject.name);
		url.searchParams.set('repository', selectedRepository.name);
		window.history.replaceState({}, '', url.toString());
	}
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2">
		<ProjectPicker bind:value={selectedProject} projects={projects} onSelect={handleProjectSelect} />
		<RepositoryPicker
			bind:value={selectedRepository}
			repositories={repositories}
			onSelect={handleRepositorySelect}
		/>
	</div>

	{#if selectedProject && selectedRepository}
		{#key `${selectedProject.name}-${selectedRepository.name}`}
			<ArtifactViewer project={selectedProject} repository={selectedRepository} />
		{/key}
	{/if}
</div>

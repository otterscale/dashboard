<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { LoaderCircleIcon, RefreshCwIcon } from '@lucide/svelte';
	import type { ColumnDef } from '@tanstack/table-core';
	import { onDestroy, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';

	import HarborViewerPicker from './harbor-viewer-picker.svelte';
	import {
		getImageColumnDefinitions,
		getImageData,
		getImageDataSchemas,
		getImageUISchemas
	} from './harbor-viewers';
	import type { HarborImage, HarborProject } from './types';

	// ─── Auto Reload ─────────────────────────────────────────────────────────

	const RELOAD_INTERVAL_MS = 15_000;
	let reloadTimer: ReturnType<typeof setInterval> | null = null;
	let isDestroyed = false;

	function startAutoReload() {
		stopAutoReload();
		reloadTimer = setInterval(() => {
			if (!isDestroyed && selectedProject) {
				fetchImages(selectedProject);
			}
		}, RELOAD_INTERVAL_MS);
	}

	function stopAutoReload() {
		if (reloadTimer) {
			clearInterval(reloadTimer);
			reloadTimer = null;
		}
	}

	// ─── Projects ────────────────────────────────────────────────────────────

	let projects = $state<HarborProject[]>([]);
	let selectedProject = $state<string | undefined>(undefined);

	async function fetchProjects() {
		try {
			const response = await fetch('/rest/harbor/projects');
			if (!response.ok) {
				console.error('Failed to fetch Harbor projects:', response.statusText);
				toast.error('Failed to fetch Harbor projects');
				return;
			}
			const data: HarborProject[] = await response.json();
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
			fetchImages(selectedProject);
		}
	}

	// ─── Images ──────────────────────────────────────────────────────────────

	const uiSchemas: Record<string, UISchemaType> = getImageUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getImageDataSchemas();

	let dataset: Record<string, JsonValue>[] = $state([]);
	let columnDefinitions: ColumnDef<Record<string, JsonValue>>[] | undefined = $state(undefined);

	let isFetching = $state(false);

	async function fetchImages(projectName: string) {
		if (isFetching || isDestroyed || !projectName) return;

		isFetching = true;
		try {
			const response = await fetch(
				`/rest/harbor/images?project=${encodeURIComponent(projectName)}`
			);
			if (!response.ok) {
				console.error('Failed to fetch Harbor images:', response.statusText);
				toast.error('Failed to fetch Harbor images');
				return;
			}
			const images: HarborImage[] = await response.json();
			dataset = (images ?? []).map((img) => getImageData(img));
		} catch (error) {
			console.error('Error fetching Harbor images:', error);
			toast.error('Error fetching Harbor images');
		} finally {
			isFetching = false;
		}
	}

	// ─── Lifecycle ───────────────────────────────────────────────────────────

	let isMounted = $state(false);

	onMount(async () => {
		await fetchProjects();
		if (selectedProject) {
			await fetchImages(selectedProject);
		}
		columnDefinitions = getImageColumnDefinitions(uiSchemas, dataSchemas);
		startAutoReload();
		isMounted = true;
	});

	onDestroy(() => {
		isDestroyed = true;
		stopAutoReload();
	});

	function handleReload() {
		if (selectedProject && !isFetching) {
			fetchImages(selectedProject);
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

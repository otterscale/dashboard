<script lang="ts">
	import Icon from '@iconify/svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import SearchAlert from '@lucide/svelte/icons/search-alert';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import * as Popover from '$lib/components/ui/popover';
	import type { ProjectType } from '$lib/server/harbor';

	let {
		value = $bindable(),
		projects,
		onSelect,
		class: className
	}: {
		value?: string;
		projects: ProjectType[];
		onSelect?: (project: ProjectType) => void;
		class?: string;
	} = $props();

	let open = $state(false);
	let searchTerm = $state('');

	const selectedProject = $derived(projects.find((p) => p.name === value));

	function handleSelect(projectName: string) {
		value = projectName;
		open = false;
		const project = projects.find((p) => p.name === projectName);
		if (project) onSelect?.(project);
	}

	function handleReset() {
		if (searchTerm) searchTerm = '';
	}
</script>

<Popover.Root bind:open>
	<Popover.Trigger class={className}>
		{#snippet child({ props })}
			<Button
				variant="outline"
				role="combobox"
				aria-expanded={open}
				class="w-full justify-between bg-background px-3 font-normal outline-offset-0 hover:bg-background focus-visible:border-ring focus-visible:outline-[3px] focus-visible:outline-ring/20"
				{...props}
			>
				{#if value && selectedProject}
					<span class="flex min-w-0 items-center gap-2">
						<Icon icon="ph:folder-simple" />
						<span class="truncate">{selectedProject.name}</span>
						<span class="text-xs text-muted-foreground">({selectedProject.repo_count} repos)</span>
					</span>
				{:else}
					<span class="text-muted-foreground">Select Project</span>
				{/if}
				<ChevronDown size={16} class="shrink-0 text-muted-foreground/80" aria-hidden="true" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-full min-w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root>
			<Command.Input placeholder="Search project..." bind:value={searchTerm} />
			<Command.List>
				<Command.Empty>
					<Empty.Root>
						<Empty.Header>
							<Empty.Media variant="icon">
								<SearchAlert />
							</Empty.Media>
							<Empty.Title>No Projects Found</Empty.Title>
							<Empty.Description>
								No projects found. Clear the filter to see all options.
							</Empty.Description>
						</Empty.Header>
						<Empty.Content>
							<Button size="sm" onclick={handleReset}>Reset</Button>
						</Empty.Content>
					</Empty.Root>
				</Command.Empty>
				<Command.Group>
					{#each projects as project (project.project_id)}
						<Command.Item value={project.name} onSelect={() => handleSelect(project.name)}>
							<Item.Root size="sm" class="w-full p-0">
								<Item.Media class="p-1">
									<Icon icon="ph:folder-simple" class="size-5" />
								</Item.Media>
								<Item.Content class="gap-0.5">
									<Item.Title class="text-xs">{project.name}</Item.Title>
									<Item.Description class="text-xs">
										{project.repo_count} repositories
									</Item.Description>
								</Item.Content>
							</Item.Root>
						</Command.Item>
					{/each}
				</Command.Group>
			</Command.List>
		</Command.Root>
	</Popover.Content>
</Popover.Root>

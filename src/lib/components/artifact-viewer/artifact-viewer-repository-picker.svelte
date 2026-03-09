<script lang="ts">
	import { BoxesIcon, BoxIcon } from '@lucide/svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import SearchAlert from '@lucide/svelte/icons/search-alert';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item/index.js';
	import * as Popover from '$lib/components/ui/popover';

	import type { RepositoryType } from './types';

	let {
		value = $bindable(),
		repositories,
		onSelect,
		class: className
	}: {
		value?: RepositoryType;
		repositories: RepositoryType[];
		onSelect?: (repository: RepositoryType) => void;
		class?: string;
	} = $props();

	let open = $state(false);
	let searchTerm = $state('');

	const selectedRepository = $derived(repositories.find((repo) => repo.id === value?.id));

	function handleSelect(repository: RepositoryType) {
		if (!repository) return;

		value = repository;
		onSelect?.(repository);
		open = false;
	}

	function handleReset() {
		if (searchTerm) searchTerm = '';
	}

	/** Strip "projectName/" prefix so only the repo name is shown */
	function displayName(name: string): string {
		const idx = name.indexOf('/');
		return idx >= 0 ? name.slice(idx + 1) : name;
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
				{#if value && selectedRepository}
					<span class="flex min-w-0 items-center gap-2">
						<BoxesIcon />
						{displayName(selectedRepository.name)}
					</span>
				{:else}
					<span class="text-muted-foreground">Select Repository</span>
				{/if}
				<ChevronDown size={16} class="shrink-0 text-muted-foreground/80" aria-hidden="true" />
			</Button>
		{/snippet}
	</Popover.Trigger>
	<Popover.Content class="w-full min-w-(--bits-popover-anchor-width) p-0" align="start">
		<Command.Root>
			<Command.Input placeholder="Search repository..." bind:value={searchTerm} />
			<Command.List>
				<Command.Empty>
					<Empty.Root>
						<Empty.Header>
							<Empty.Media variant="icon">
								<SearchAlert />
							</Empty.Media>
							<Empty.Title>No Repositories Found</Empty.Title>
							<Empty.Description>
								No repositories found. Clear the filter to see all options.
							</Empty.Description>
						</Empty.Header>
						<Empty.Content>
							<Button size="sm" onclick={handleReset}>Reset</Button>
						</Empty.Content>
					</Empty.Root>
				</Command.Empty>
				<Command.Group>
					{#each repositories as repo (repo.id)}
						<Command.Item value={repo.name} onSelect={() => handleSelect(repo)}>
							<Item.Root size="sm" class="w-full p-0">
								<Item.Media>
									<BoxIcon />
								</Item.Media>
								<Item.Content class="gap-0.5">
									<Item.Title class="text-xs">{displayName(repo.name)}</Item.Title>
									<Item.Description class="text-xs">
										{repo.artifact_count} artifacts
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

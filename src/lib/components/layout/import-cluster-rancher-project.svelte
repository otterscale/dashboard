<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { LinkService, type RancherProject } from '@otterscale/api/link/v1';
	import { getContext, onMount } from 'svelte';

	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Field from '$lib/components/ui/field';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';
	import {
		createRancherProjectLoader,
		rancherProjectSecondaryText
	} from '$lib/utils/rancher-project';

	let {
		value = $bindable('')
	}: {
		/** Selected Rancher Project id, or '' for none. */
		value: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const linkClient = createClient(LinkService, transport);
	const loadRancherProjects = createRancherProjectLoader(() =>
		linkClient.listRancherProjects({}).then((response) => response.projects)
	);

	let projects = $state<RancherProject[]>([]);
	let popoverOpen = $state(false);
	let loading = $state(false);
	let errorMessage = $state('');
	// Stays false until listRancherProjects has returned successfully at least
	// once; drives whether the field renders at all.
	let fetched = $state(false);
	// Guards against a slow response landing after a newer request.
	let requestId = 0;

	// Rancher isn't wired up on every deployment. Once we've confirmed there are
	// no projects to pick (and no error worth retrying), render nothing rather
	// than showing an empty selector.
	const show = $derived(!fetched || errorMessage !== '' || projects.length > 0);

	// Probe as soon as the field mounts (the wizard is on step 1) so we can
	// decide whether to render before the user ever reaches for it.
	onMount(fetchProjects);

	async function fetchProjects() {
		if (loading) return;
		const request = ++requestId;
		loading = true;
		errorMessage = '';

		try {
			const next = await loadRancherProjects();
			if (request !== requestId) return;
			projects = next;
			fetched = true;
			if (!next.some((project) => project.id === value)) {
				value = '';
			}
		} catch (error) {
			if (request !== requestId) return;
			projects = [];
			errorMessage =
				error instanceof ConnectError || error instanceof Error
					? error.message
					: m.import_cluster_rancher_project_error();
		} finally {
			if (request === requestId) loading = false;
		}
	}

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) fetchProjects();
	}
</script>

{#if show}
	<Field.Field>
		<Field.FieldLabel>{m.import_cluster_rancher_project_label()}</Field.FieldLabel>
		<Field.FieldDescription>
			{m.import_cluster_rancher_project_description()}
		</Field.FieldDescription>

		<Popover.Root bind:open={popoverOpen} onOpenChange={handleOpenChange}>
			<Popover.Trigger class="w-full">
				{#snippet child({ props })}
					<Button
						{...props}
						variant="outline"
						role="combobox"
						aria-expanded={popoverOpen}
						class="w-full justify-between"
					>
						<span class={cn('truncate', !value && 'text-muted-foreground')}>
							{value || m.import_cluster_rancher_project_placeholder()}
						</span>
						<ChevronDownIcon class="ml-2 size-4 shrink-0 opacity-50" />
					</Button>
				{/snippet}
			</Popover.Trigger>
			<Popover.Content class="w-[var(--bits-popover-anchor-width)] min-w-xs p-0" align="start">
				<Command.Root>
					<Command.Input placeholder={m.import_cluster_rancher_project_search()} />
					<Command.List>
						{#if loading}
							<Command.Loading>
								{m.import_cluster_rancher_project_loading()}
							</Command.Loading>
						{:else if errorMessage}
							<div class="flex flex-col items-start gap-2 p-3">
								<p class="text-sm text-destructive">
									{m.import_cluster_rancher_project_error()}
								</p>
								<p class="text-xs text-muted-foreground">{errorMessage}</p>
								<Button size="sm" variant="outline" onclick={fetchProjects}>
									{m.import_cluster_rancher_project_retry()}
								</Button>
							</div>
						{:else}
							<Command.Empty>
								{m.import_cluster_rancher_project_empty()}
							</Command.Empty>
							<Command.Group>
								{#if projects.length > 0}
									<Command.Item
										value={m.import_cluster_rancher_project_none()}
										onSelect={() => {
											value = '';
											popoverOpen = false;
										}}
									>
										<CheckIcon class={cn('mr-2 size-4', value && 'text-transparent')} />
										{m.import_cluster_rancher_project_none()}
									</Command.Item>
								{/if}
								{#each projects as project (project.id)}
									<Command.Item
										value={project.id}
										onSelect={() => {
											value = project.id;
											popoverOpen = false;
										}}
									>
										<CheckIcon
											class={cn('mr-2 size-4', value !== project.id && 'text-transparent')}
										/>
										<div class="flex min-w-0 flex-col">
											<span class="truncate font-medium">{project.id}</span>
											{#if rancherProjectSecondaryText(project)}
												<span class="truncate text-xs text-muted-foreground">
													{rancherProjectSecondaryText(project)}
												</span>
											{/if}
										</div>
									</Command.Item>
								{/each}
							</Command.Group>
						{/if}
					</Command.List>
				</Command.Root>
			</Popover.Content>
		</Popover.Root>
	</Field.Field>
{/if}

<script lang="ts" module>
	export interface KeycloakUser {
		id: string;
		username: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}
</script>

<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import UserIcon from '@lucide/svelte/icons/user';
	import XIcon from '@lucide/svelte/icons/x';
	import { onDestroy } from 'svelte';

	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Command from '$lib/components/ui/command';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import * as Item from '$lib/components/ui/item';
	import * as Popover from '$lib/components/ui/popover';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	let {
		users = $bindable([])
	}: {
		/** The selected administrators. */
		users: KeycloakUser[];
	} = $props();

	let popoverOpen = $state(false);
	let query = $state('');
	let results = $state<KeycloakUser[]>([]);
	let loading = $state(false);
	let initialized = false;
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});

	function displayName(u: KeycloakUser): string {
		const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
		return full || u.username;
	}

	async function fetchUsers(q: string) {
		loading = true;
		try {
			const res = await fetch(`/rest/users?search=${encodeURIComponent(q)}&max=10`);
			results = res.ok ? ((await res.json()) as KeycloakUser[]) : [];
		} catch (e) {
			console.error('Failed to search users:', e);
			results = [];
		} finally {
			loading = false;
		}
	}

	function handleSearch(q: string) {
		query = q;
		if (debounceTimer) clearTimeout(debounceTimer);
		debounceTimer = setTimeout(() => {
			fetchUsers(q);
		}, 300);
	}

	function handleOpenChange(isOpen: boolean) {
		if (isOpen && !initialized) {
			initialized = true;
			fetchUsers('');
		}
	}

	function toggleUser(u: KeycloakUser) {
		const i = users.findIndex((s) => s.id === u.id);
		if (i >= 0) {
			users.splice(i, 1);
		} else {
			users.push(u);
		}
	}

	function removeUser(id: string) {
		users = users.filter((s) => s.id !== id);
	}
</script>

{#snippet userSearch(
	align: 'center' | 'start',
	variant: 'default' | 'outline',
	triggerClass: string
)}
	<Popover.Root bind:open={popoverOpen} onOpenChange={handleOpenChange}>
		<Popover.Trigger>
			{#snippet child({ props })}
				<Button {...props} {variant} class={triggerClass}>
					<PlusIcon data-icon="inline-start" />
					{m.import_cluster_add_administrator()}
				</Button>
			{/snippet}
		</Popover.Trigger>
		<Popover.Content class="w-80 p-0" {align}>
			<Command.Root shouldFilter={false}>
				<Command.Input
					placeholder={m.import_cluster_search_users_placeholder()}
					value={query}
					oninput={(e) => handleSearch(e.currentTarget.value)}
				/>
				<Command.List>
					{#if loading}
						<Command.Loading>{m.import_cluster_searching()}</Command.Loading>
					{:else}
						<Command.Empty>{m.import_cluster_no_users_found()}</Command.Empty>
						<Command.Group>
							{#each results as user (user.id)}
								{@const isSelected = users.some((s) => s.id === user.id)}
								<Command.Item value={user.id} onSelect={() => toggleUser(user)}>
									<CheckIcon class={cn('mr-2 size-4', !isSelected && 'text-transparent')} />
									<div class="flex flex-col">
										<span class="font-medium">{displayName(user)}</span>
										<span class="text-xs text-muted-foreground">
											{user.email || user.username}
										</span>
									</div>
								</Command.Item>
							{/each}
						</Command.Group>
					{/if}
				</Command.List>
			</Command.Root>
		</Popover.Content>
	</Popover.Root>
{/snippet}

<Field.Field>
	<Field.FieldLabel>{m.import_cluster_administrators()}</Field.FieldLabel>
	<Field.FieldDescription>
		{m.import_cluster_administrators_description()}
	</Field.FieldDescription>

	<!--
		The picker (and its Popover) is rendered once, outside the empty/list branches:
		selecting the first user flips users.length 0→1, and if the Popover lived inside
		that conditional it would be torn down and remounted mid-interaction — the new
		instance reopens itself (popoverOpen is still true for multi-select) and steals
		focus to its trigger.
	-->
	{#if users.length === 0}
		<Empty.Root class="rounded-md border">
			<Empty.Header>
				<Empty.Media>
					<Avatar.Group>
						<Avatar.Root>
							<Avatar.Fallback><UserIcon class="size-4" /></Avatar.Fallback>
						</Avatar.Root>
						<Avatar.Root>
							<Avatar.Fallback><UserIcon class="size-4" /></Avatar.Fallback>
						</Avatar.Root>
						<Avatar.Root>
							<Avatar.Fallback><UserIcon class="size-4" /></Avatar.Fallback>
						</Avatar.Root>
					</Avatar.Group>
				</Empty.Media>
				<Empty.Title>{m.import_cluster_no_administrators()}</Empty.Title>
				<Empty.Description>
					{m.import_cluster_no_administrators_description()}
				</Empty.Description>
			</Empty.Header>
		</Empty.Root>
	{:else}
		<div class="flex flex-col gap-2">
			{#each users as user (user.id)}
				<Item.Root variant="outline">
					<Item.Media>
						<Avatar.Root>
							<Avatar.Fallback>
								{displayName(user).charAt(0).toUpperCase()}
							</Avatar.Fallback>
						</Avatar.Root>
					</Item.Media>
					<Item.Content>
						<Item.Title>{displayName(user)}</Item.Title>
						<Item.Description>{user.email || user.username}</Item.Description>
					</Item.Content>
					<Item.Actions>
						<Button
							variant="ghost"
							size="icon"
							onclick={() => removeUser(user.id)}
							aria-label={m.import_cluster_remove_user({ name: displayName(user) })}
						>
							<XIcon />
						</Button>
					</Item.Actions>
				</Item.Root>
			{/each}
		</div>
	{/if}

	{@render userSearch('start', 'outline', 'w-full justify-start')}
</Field.Field>

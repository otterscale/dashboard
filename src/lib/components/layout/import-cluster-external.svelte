<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ServerIcon from '@lucide/svelte/icons/server';
	import TerminalIcon from '@lucide/svelte/icons/terminal';
	import UserIcon from '@lucide/svelte/icons/user';
	import XIcon from '@lucide/svelte/icons/x';
	import { type Link, LinkService } from '@otterscale/api/link/v1';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';

	import * as Code from '$lib/components/custom/code';
	import * as Avatar from '$lib/components/ui/avatar';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import * as Command from '$lib/components/ui/command';
	import * as Empty from '$lib/components/ui/empty';
	import * as Field from '$lib/components/ui/field';
	import { Input } from '$lib/components/ui/input';
	import * as Item from '$lib/components/ui/item';
	import * as Popover from '$lib/components/ui/popover';
	import { Spinner } from '$lib/components/ui/spinner';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';

	let {
		stepIndex = $bindable(1),
		onBack,
		onFinish
	}: {
		stepIndex: number;
		onBack: () => void;
		onFinish: () => void;
	} = $props();

	const POLL_INTERVAL = 3000;

	interface KeycloakUser {
		id: string;
		username: string;
		email?: string;
		firstName?: string;
		lastName?: string;
	}

	const transport: Transport = getContext('transport');
	const linkClient = createClient(LinkService, transport);
	const resourceClient = createClient(ResourceService, transport);

	let clusterName = $state('');
	let installUrl = $state('');
	let manifestYaml = $state('');
	let clusterStatus = $state<'pending' | 'installing' | 'done'>('pending');
	let isCreating = $state(false);
	let errorMessage = $state('');
	let isYamlOpen = $state(false);

	let selectedUsers = $state<KeycloakUser[]>([]);
	let userSearchOpen = $state(false);
	let userSearchQuery = $state('');
	let userSearchResults = $state<KeycloakUser[]>([]);
	let userSearchLoading = $state(false);
	let userSearchInitialized = false;
	let userDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	let isPolling = false;
	let abortController: AbortController | null = null;

	onDestroy(() => {
		abortController?.abort();
	});

	const installCommand = $derived(
		installUrl ? `kubectl apply -f ${installUrl}` : m.import_cluster_generating_command()
	);

	const canGoNext = $derived(stepIndex === 1 ? clusterName.trim().length > 0 : false);

	function displayName(u: KeycloakUser): string {
		const full = `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
		return full || u.username;
	}

	async function fetchUsers(q: string) {
		userSearchLoading = true;
		try {
			const res = await fetch(`/rest/users?search=${encodeURIComponent(q)}&max=10`);
			userSearchResults = res.ok ? ((await res.json()) as KeycloakUser[]) : [];
		} catch (e) {
			console.error('Failed to search users:', e);
			userSearchResults = [];
		} finally {
			userSearchLoading = false;
		}
	}

	function handleUserSearch(q: string) {
		userSearchQuery = q;
		if (userDebounceTimer) clearTimeout(userDebounceTimer);
		userDebounceTimer = setTimeout(() => {
			fetchUsers(q);
		}, 300);
	}

	function handleUserPopoverOpenChange(open: boolean) {
		if (open && !userSearchInitialized) {
			userSearchInitialized = true;
			fetchUsers('');
		}
	}

	function toggleUser(u: KeycloakUser) {
		const i = selectedUsers.findIndex((s) => s.id === u.id);
		if (i >= 0) {
			selectedUsers.splice(i, 1);
		} else {
			selectedUsers.push(u);
		}
	}

	function removeUser(id: string) {
		selectedUsers = selectedUsers.filter((s) => s.id !== id);
	}

	async function handleGenerateManifest() {
		if (!clusterName.trim() || isCreating) return;
		isCreating = true;
		errorMessage = '';

		try {
			const response = await linkClient.getAgentManifest({
				cluster: clusterName,
				extraUsers: selectedUsers.map((u) => u.id).filter((id) => id)
			});

			installUrl = response.url;
			manifestYaml = response.manifest;
			clusterStatus = 'pending';
			stepIndex = 2;

			toast.success(m.import_cluster_manifest_generated({ name: clusterName }));
			pollForConnection();
		} catch (e) {
			if (e instanceof ConnectError) {
				errorMessage = e.message;
			} else {
				errorMessage = e instanceof Error ? e.message : m.import_cluster_manifest_failed();
			}
			toast.error(errorMessage);
		} finally {
			isCreating = false;
		}
	}

	async function pollForConnection() {
		if (isPolling) return;
		isPolling = true;

		abortController?.abort();
		abortController = new AbortController();
		const signal = abortController.signal;

		while (!signal.aborted && clusterStatus === 'pending') {
			try {
				const response = await linkClient.listLinks({});
				if (signal.aborted) break;

				const found = response.links.some((link: Link) => link.cluster === clusterName);
				if (found) {
					clusterStatus = 'installing';
					break;
				}
			} catch {
				// retry silently
			}
			if (!signal.aborted) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		}

		while (!signal.aborted && clusterStatus === 'installing') {
			try {
				const response = await resourceClient.get({
					cluster: clusterName,
					namespace: 'otterscale-system',
					group: 'apps',
					version: 'v1',
					resource: 'deployments',
					name: 'tenant-operator-controller-manager'
				});
				if (signal.aborted) break;

				const obj = response.object as Record<string, any>;
				const conditions: any[] = obj?.status?.conditions ?? [];
				const available = conditions.find((c: any) => c.type === 'Available');
				if (available?.status === 'True') {
					clusterStatus = 'done';
					stepIndex = 3;
					break;
				}
			} catch {
				// deployment may not exist yet, retry silently
			}
			if (!signal.aborted) {
				await new Promise((r) => setTimeout(r, POLL_INTERVAL));
			}
		}

		isPolling = false;
	}
</script>

<div class="flex h-full min-h-0 flex-1 flex-col gap-6">
	{#if stepIndex === 1}
		{@render stepClusterInfo()}
	{:else if stepIndex === 2}
		{@render stepDeployAgent()}
	{:else if stepIndex === 3}
		{@render stepVerifyBinding()}
	{/if}

	{#if stepIndex === 1 || stepIndex === 3}
		<div class="mt-auto flex w-full items-center justify-between gap-3 pt-4">
			{#if stepIndex === 1}
				<Button variant="outline" onclick={onBack}>{m.previous()}</Button>
				<Button onclick={handleGenerateManifest} disabled={!canGoNext || isCreating}>
					{#if isCreating}
						<Spinner data-icon="inline-start" />
						{m.import_cluster_generating()}
					{:else}
						<TerminalIcon data-icon="inline-start" />
						{m.import_cluster_generate_install_command()}
					{/if}
				</Button>
			{:else if stepIndex === 3}
				<div></div>
				<Button onclick={onFinish}>{m.done()}</Button>
			{/if}
		</div>
	{/if}
</div>

{#snippet stepClusterInfo()}
	<form
		class="flex flex-col gap-6"
		onsubmit={(e) => {
			e.preventDefault();
			if (canGoNext) handleGenerateManifest();
		}}
	>
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">{m.import_cluster_info_title()}</h3>
			<p class="text-sm text-muted-foreground">{m.import_cluster_info_description()}</p>
		</div>

		<Field.FieldGroup>
			<Field.Field>
				<Field.FieldLabel for="wizard-cluster-name">{m.import_cluster_name_label()}</Field.FieldLabel>
				<Input
					id="wizard-cluster-name"
					type="text"
					placeholder={m.import_cluster_name_placeholder()}
					bind:value={clusterName}
					required
				/>
			</Field.Field>

			<Field.Field>
				<Field.FieldLabel>{m.import_cluster_administrators()}</Field.FieldLabel>
				<Field.FieldDescription>
					{m.import_cluster_administrators_description()}
				</Field.FieldDescription>

				{#if selectedUsers.length === 0}
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
						<Empty.Content>
							<Popover.Root bind:open={userSearchOpen} onOpenChange={handleUserPopoverOpenChange}>
								<Popover.Trigger>
									{#snippet child({ props })}
										<Button {...props}>
											<PlusIcon data-icon="inline-start" />
											{m.import_cluster_add_administrator()}
										</Button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-80 p-0" align="center">
									<Command.Root shouldFilter={false}>
										<Command.Input
											placeholder={m.import_cluster_search_users_placeholder()}
											value={userSearchQuery}
											oninput={(e) => handleUserSearch(e.currentTarget.value)}
										/>
										<Command.List>
											{#if userSearchLoading}
												<Command.Loading>{m.import_cluster_searching()}</Command.Loading>
											{:else}
												<Command.Empty>{m.import_cluster_no_users_found()}</Command.Empty>
												<Command.Group>
													{#each userSearchResults as user (user.id)}
														{@const isSelected = selectedUsers.some((s) => s.id === user.id)}
														<Command.Item value={user.id} onSelect={() => toggleUser(user)}>
															<CheckIcon
																class={cn('mr-2 size-4', !isSelected && 'text-transparent')}
															/>
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
						</Empty.Content>
					</Empty.Root>
				{:else}
					<div class="flex flex-col gap-2">
						{#each selectedUsers as user (user.id)}
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

						<Popover.Root bind:open={userSearchOpen} onOpenChange={handleUserPopoverOpenChange}>
							<Popover.Trigger>
								{#snippet child({ props })}
									<Button {...props} variant="outline" class="w-full justify-start">
										<PlusIcon data-icon="inline-start" />
										{m.import_cluster_add_administrator()}
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-80 p-0" align="start">
								<Command.Root shouldFilter={false}>
									<Command.Input
										placeholder={m.import_cluster_search_users_placeholder()}
										value={userSearchQuery}
										oninput={(e) => handleUserSearch(e.currentTarget.value)}
									/>
									<Command.List>
										{#if userSearchLoading}
											<Command.Loading>{m.import_cluster_searching()}</Command.Loading>
										{:else}
											<Command.Empty>{m.import_cluster_no_users_found()}</Command.Empty>
											<Command.Group>
												{#each userSearchResults as user (user.id)}
													{@const isSelected = selectedUsers.some((s) => s.id === user.id)}
													<Command.Item value={user.id} onSelect={() => toggleUser(user)}>
														<CheckIcon
															class={cn('mr-2 size-4', !isSelected && 'text-transparent')}
														/>
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
					</div>
				{/if}
			</Field.Field>
		</Field.FieldGroup>

		<button type="submit" class="hidden" disabled={!canGoNext || isCreating}>{m.submit()}</button>
	</form>
{/snippet}

{#snippet stepDeployAgent()}
	<div class="flex min-h-0 flex-1 flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">{m.import_cluster_deploy_agent_title()}</h3>
			<p class="text-sm text-muted-foreground">
				{m.import_cluster_deploy_agent_description()}
			</p>
		</div>

		<div
			class={cn(
				'flex flex-col gap-3 rounded-lg border bg-card p-4',
				isYamlOpen && 'min-h-0 flex-1'
			)}
		>
			<Field.FieldLabel class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				{m.import_cluster_install_command_label()}
			</Field.FieldLabel>

			<Code.Root
				lang="bash"
				class="w-full shrink-0 pr-12 text-sm [&_pre.shiki]:[scrollbar-width:none] [&_pre.shiki::-webkit-scrollbar]:hidden"
				variant="secondary"
				code={installCommand}
				hideLines
			>
				<Code.CopyButton />
			</Code.Root>

			<Field.FieldDescription>
				{m.import_cluster_install_command_description()}
			</Field.FieldDescription>

			{#if manifestYaml}
				<Collapsible.Root
					bind:open={isYamlOpen}
					class={cn('flex flex-col', isYamlOpen && 'min-h-0 flex-1')}
				>
					<Collapsible.Trigger
						class="group flex w-full items-center justify-between border-t pt-3 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
					>
						<span class="flex items-center gap-2">
							<FileCodeIcon class="size-4" />
							{m.import_cluster_preview_yaml()}
						</span>
						<ChevronDownIcon
							class="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180"
						/>
					</Collapsible.Trigger>
					<Collapsible.Content class="flex min-h-0 flex-1 flex-col">
						<div class="mt-2 min-h-0 flex-1 overflow-auto rounded-md border">
							<Code.Root lang="yaml" class="w-full text-xs" code={manifestYaml}>
								<Code.CopyButton />
							</Code.Root>
						</div>
					</Collapsible.Content>
				</Collapsible.Root>
			{/if}
		</div>

		<Item.Root variant="outline">
			<Item.Media variant="icon" class="size-10 rounded-full bg-muted text-muted-foreground">
				<ServerIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>{clusterName}</Item.Title>
				<Item.Description>{m.import_cluster_target_cluster()}</Item.Description>
			</Item.Content>
			<Item.Actions>
				{#if clusterStatus === 'pending'}
					<span class="flex items-center gap-2 text-muted-foreground">
						<span class="relative flex size-2">
							<span
								class="absolute inline-flex size-full animate-ping rounded-full bg-primary/75 opacity-75"
							></span>
							<span class="relative inline-flex size-2 rounded-full bg-primary"></span>
						</span>
						{m.import_cluster_waiting_connection()}
					</span>
				{:else if clusterStatus === 'installing'}
					<span class="flex items-center gap-2 text-amber-500">
						<Spinner />
						<span class="font-medium">{m.import_cluster_installing()}</span>
					</span>
				{:else}
					<span class="flex items-center gap-2 text-primary">
						<CircleCheckIcon />
						<span class="font-medium">{m.import_cluster_managed_status()}</span>
					</span>
				{/if}
			</Item.Actions>
		</Item.Root>
	</div>
{/snippet}

{#snippet stepVerifyBinding()}
	<Empty.Root>
		<Empty.Header>
			<Empty.Media variant="icon" class="size-14 bg-primary/10 ring-4 ring-primary/5">
				<CircleCheckIcon class="size-8 text-primary" />
			</Empty.Media>
			<Empty.Title>{m.import_cluster_managed_successfully_title()}</Empty.Title>
			<Empty.Description>
				<strong>{clusterName}</strong>{m.import_cluster_managed_ready_suffix()}
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<div class="w-full max-w-sm rounded-lg border bg-card p-3 text-sm shadow-sm">
				<div class="flex flex-col gap-2">
					<div class="flex justify-between">
						<span class="text-muted-foreground">{m.cluster()}</span>
						<span class="font-medium">{clusterName}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">{m.status()}</span>
						<span class="flex items-center gap-1.5 font-medium text-primary">
							<span class="size-1.5 rounded-full bg-primary"></span>
							{m.import_cluster_managed()}
						</span>
					</div>
					{#if selectedUsers.length > 0}
						<div class="flex justify-between">
							<span class="text-muted-foreground">{m.import_cluster_permissions()}</span>
							<span class="flex items-center gap-1.5 font-medium text-primary">
								<CircleCheckIcon class="size-3.5" />
								{m.import_cluster_admin_count({ count: selectedUsers.length })}
							</span>
						</div>
					{/if}
				</div>
			</div>
		</Empty.Content>
	</Empty.Root>
{/snippet}

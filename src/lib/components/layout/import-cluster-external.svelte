<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import FileCodeIcon from '@lucide/svelte/icons/file-code';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ServerIcon from '@lucide/svelte/icons/server';
	import TerminalIcon from '@lucide/svelte/icons/terminal';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import UserIcon from '@lucide/svelte/icons/user';
	import XIcon from '@lucide/svelte/icons/x';
	import { type Link, LinkService } from '@otterscale/api/link/v1';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onDestroy } from 'svelte';
	import { toast } from 'svelte-sonner';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import { CopyButton } from '$lib/components/custom/copy-button';
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
	const CLUSTER_ADMIN_BINDING_NAME = 'otterscale-cluster-admins';

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
	let clusterStatus = $state<
		'pending' | 'installing' | 'ready' | 'binding' | 'done' | 'binding-failed'
	>('pending');
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
	let bindingError = $state('');

	let isPolling = false;
	let abortController: AbortController | null = null;

	onDestroy(() => {
		abortController?.abort();
	});

	const installCommand = $derived(
		installUrl ? `kubectl apply -f ${installUrl}` : 'Generating install command...'
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

	async function createClusterAdminBinding() {
		const subjects = selectedUsers
			.filter((u) => u.id)
			.map((u) => ({
				kind: 'User',
				name: u.id,
				apiGroup: 'rbac.authorization.k8s.io'
			}));
		if (subjects.length === 0) return;

		const manifestObj = {
			apiVersion: 'rbac.authorization.k8s.io/v1',
			kind: 'ClusterRoleBinding',
			metadata: { name: CLUSTER_ADMIN_BINDING_NAME },
			roleRef: {
				apiGroup: 'rbac.authorization.k8s.io',
				kind: 'ClusterRole',
				name: 'cluster-admin'
			},
			subjects
		};
		const manifest = new TextEncoder().encode(stringify(manifestObj));

		await resourceClient.create({
			cluster: clusterName,
			group: 'rbac.authorization.k8s.io',
			version: 'v1',
			resource: 'clusterrolebindings',
			manifest
		});
	}

	async function handleGenerateManifest() {
		if (!clusterName.trim() || isCreating) return;
		isCreating = true;
		errorMessage = '';

		try {
			const response = await linkClient.getAgentManifest({
				cluster: clusterName
			});

			installUrl = response.url;
			manifestYaml = response.manifest;
			clusterStatus = 'pending';
			stepIndex = 2;

			toast.success(`Agent manifest generated for "${clusterName}"`);
			pollForConnection();
		} catch (e) {
			if (e instanceof ConnectError) {
				errorMessage = e.message;
			} else {
				errorMessage = e instanceof Error ? e.message : 'Failed to generate manifest';
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
					clusterStatus = 'ready';
					if (selectedUsers.length > 0) {
						clusterStatus = 'binding';
						try {
							await createClusterAdminBinding();
							clusterStatus = 'done';
						} catch (e) {
							bindingError =
								e instanceof ConnectError
									? e.message
									: e instanceof Error
										? e.message
										: 'Failed to grant cluster-admin';
							clusterStatus = 'binding-failed';
							toast.error(`Permission grant failed: ${bindingError}`);
						}
					} else {
						clusterStatus = 'done';
					}
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
				<Button variant="outline" onclick={onBack}>Previous</Button>
				<Button onclick={handleGenerateManifest} disabled={!canGoNext || isCreating}>
					{#if isCreating}
						<Spinner data-icon="inline-start" />
						Generating...
					{:else}
						<TerminalIcon data-icon="inline-start" />
						Generate Install Command
					{/if}
				</Button>
			{:else if stepIndex === 3}
				<div></div>
				<Button onclick={onFinish}>Done</Button>
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
			<h3 class="text-xl font-bold">Cluster Information</h3>
			<p class="text-sm text-muted-foreground">Provide details about this cluster.</p>
		</div>

		<Field.FieldGroup>
			<Field.Field>
				<Field.FieldLabel for="wizard-cluster-name">Cluster Name</Field.FieldLabel>
				<Input
					id="wizard-cluster-name"
					type="text"
					placeholder="e.g. production-us-west-2"
					bind:value={clusterName}
					required
				/>
			</Field.Field>

			<Field.Field>
				<Field.FieldLabel>Cluster Administrators</Field.FieldLabel>
				<Field.FieldDescription>
					Selected users will be granted cluster-admin via ClusterRoleBinding.
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
							<Empty.Title>No Administrators</Empty.Title>
							<Empty.Description>
								Grant trusted users cluster-admin access to manage this cluster.
							</Empty.Description>
						</Empty.Header>
						<Empty.Content>
							<Popover.Root bind:open={userSearchOpen} onOpenChange={handleUserPopoverOpenChange}>
								<Popover.Trigger>
									{#snippet child({ props })}
										<Button {...props}>
											<PlusIcon data-icon="inline-start" />
											Add Administrator
										</Button>
									{/snippet}
								</Popover.Trigger>
								<Popover.Content class="w-80 p-0" align="center">
									<Command.Root shouldFilter={false}>
										<Command.Input
											placeholder="Search users..."
											value={userSearchQuery}
											oninput={(e) => handleUserSearch(e.currentTarget.value)}
										/>
										<Command.List>
											{#if userSearchLoading}
												<Command.Loading>Searching...</Command.Loading>
											{:else}
												<Command.Empty>No users found.</Command.Empty>
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
										aria-label={`Remove ${displayName(user)}`}
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
										Add administrator
									</Button>
								{/snippet}
							</Popover.Trigger>
							<Popover.Content class="w-80 p-0" align="start">
								<Command.Root shouldFilter={false}>
									<Command.Input
										placeholder="Search users..."
										value={userSearchQuery}
										oninput={(e) => handleUserSearch(e.currentTarget.value)}
									/>
									<Command.List>
										{#if userSearchLoading}
											<Command.Loading>Searching...</Command.Loading>
										{:else}
											<Command.Empty>No users found.</Command.Empty>
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

		<button type="submit" class="hidden" disabled={!canGoNext || isCreating}>Submit</button>
	</form>
{/snippet}

{#snippet stepDeployAgent()}
	<div class="flex min-h-0 flex-1 flex-col gap-6">
		<div class="flex flex-col gap-1">
			<h3 class="text-xl font-bold">Deploy Agent</h3>
			<p class="text-sm text-muted-foreground">
				Run the generated command on your target cluster to enroll it.
			</p>
		</div>

		<div
			class={cn(
				'flex flex-col gap-3 rounded-lg border bg-card p-4',
				isYamlOpen && 'min-h-0 flex-1'
			)}
		>
			<Field.FieldLabel class="text-xs font-medium tracking-wide text-muted-foreground uppercase">
				Install Command
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
				Copy and execute this command with kubectl on the cluster you want to import.
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
							Preview YAML Manifest
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
				<Item.Description>Target Cluster</Item.Description>
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
						Waiting for connection
					</span>
				{:else if clusterStatus === 'installing'}
					<span class="flex items-center gap-2 text-amber-500">
						<Spinner />
						<span class="font-medium">Installing...</span>
					</span>
				{:else if clusterStatus === 'binding'}
					<span class="flex items-center gap-2 text-amber-500">
						<Spinner />
						<span class="font-medium">Granting cluster-admin...</span>
					</span>
				{:else if clusterStatus === 'binding-failed'}
					<span class="flex items-center gap-2 text-amber-600">
						<TriangleAlertIcon class="size-4" />
						<span class="font-medium">Permissions failed</span>
					</span>
				{:else}
					<span class="flex items-center gap-2 text-primary">
						<CircleCheckIcon />
						<span class="font-medium">Managed successfully</span>
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
			<Empty.Title>Managed Successfully</Empty.Title>
			<Empty.Description>
				<strong>{clusterName}</strong> is now managed and ready to use.
			</Empty.Description>
		</Empty.Header>
		<Empty.Content>
			<div class="w-full max-w-sm rounded-lg border bg-card p-3 text-sm shadow-sm">
				<div class="flex flex-col gap-2">
					<div class="flex justify-between">
						<span class="text-muted-foreground">Cluster</span>
						<span class="font-medium">{clusterName}</span>
					</div>
					<div class="flex justify-between">
						<span class="text-muted-foreground">Status</span>
						<span class="flex items-center gap-1.5 font-medium text-primary">
							<span class="size-1.5 rounded-full bg-primary"></span>
							Managed
						</span>
					</div>
					{#if selectedUsers.length > 0}
						<div class="flex justify-between">
							<span class="text-muted-foreground">Permissions</span>
							{#if clusterStatus === 'binding-failed'}
								<span class="flex items-center gap-1.5 font-medium text-amber-600">
									<TriangleAlertIcon class="size-3.5" />
									Failed
								</span>
							{:else}
								<span class="flex items-center gap-1.5 font-medium text-primary">
									<CircleCheckIcon class="size-3.5" />
									{selectedUsers.length} cluster-admin{selectedUsers.length > 1 ? 's' : ''}
								</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
			{#if clusterStatus === 'binding-failed'}
				<p class="mt-3 max-w-sm text-center text-xs text-muted-foreground">
					<strong class="text-amber-600">Permissions failed:</strong>
					{bindingError || 'Could not grant cluster-admin.'} You can assign it manually from the ClusterRoleBinding
					view.
				</p>
			{/if}
		</Empty.Content>
	</Empty.Root>
{/snippet}

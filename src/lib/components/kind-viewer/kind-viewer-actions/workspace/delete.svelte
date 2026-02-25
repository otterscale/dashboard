<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Trash2 } from '@lucide/svelte';
	import { type TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { type GetRequest, ResourceService } from '$lib/api/resource/v1/resource_pb';
	import * as Form from '$lib/components/custom/form';
	import { Single as SingleInput } from '$lib/components/custom/input';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';
	import { activeWorkspaceName } from '$lib/stores';

	let {
		object,
		onOpenChangeComplete
	}: {
		object: TenantOtterscaleIoV1Alpha1Workspace;
		onOpenChangeComplete: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const cluster = $derived(page.params.cluster ?? page.params.scope ?? '');
	const name = $derived(object?.metadata?.name ?? '');

	let open = $state(false);
	let confirmName = $state('');
	let invalid = $state(false);
	let isDeleting = $state(false);

	function init() {
		confirmName = '';
		invalid = false;
		isDeleting = false;
	}

	async function handleDelete() {
		if (isDeleting) return;
		isDeleting = true;

		toast.promise(
			async () => {
				await resourceClient.delete({
					cluster,
					group: 'tenant.otterscale.io',
					version: 'v1alpha1',
					resource: 'workspaces',
					name: name
				});
			},
			{
				loading: `Deleting workspace ${name}...`,
				success: () => {
					isDeleting = false;
					open = false;
					// Use window.location.href to force a full page reload and re-trigger fetchWorkspaces
					window.location.href = resolve(`/(auth)/scope/${cluster}`);
					return `Successfully deleted workspace ${name}`;
				},
				error: (err) => {
					isDeleting = false;
					console.error('Failed to delete workspace:', err);
					return `Failed to delete workspace: ${(err as ConnectError).message}`;
				}
			}
		);
	}

	let role: string | undefined = $state('');

	onMount(async () => {
		const response = await resourceClient.get({
			cluster: page.params.cluster ?? page.params.scope ?? '',
			group: 'tenant.otterscale.io',
			version: 'v1alpha1',
			resource: 'workspaces',
			name: $activeWorkspaceName
		} as GetRequest);
		role = (response.object as TenantOtterscaleIoV1Alpha1Workspace).spec.users.find(
			(user) => user.subject === page.data.user.sub
		)?.role;
	});
</script>

<AlertDialog.Root
	bind:open
	onOpenChange={(isOpen) => {
		if (isOpen) {
			init();
		}
	}}
	{onOpenChangeComplete}
>
	<AlertDialog.Trigger
		disabled={role === 'view'}
		class="w-full text-destructive disabled:opacity-50"
	>
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<Trash2 class="text-destructive" />
			</Item.Media>
			<Item.Content>
				<Item.Title>Delete</Item.Title>
			</Item.Content>
		</Item.Root>
	</AlertDialog.Trigger>
	<AlertDialog.Content>
		<AlertDialog.Header>Delete Workspace</AlertDialog.Header>
		<Form.Root>
			<Form.Fieldset>
				<Form.Field>
					<Form.Label>Workspace Name</Form.Label>
					<Form.Help>
						{m.deletion_warning({ identifier: 'Workspace' })}
					</Form.Help>
					<SingleInput.Confirm required target={name} bind:value={confirmName} bind:invalid />
				</Form.Field>
			</Form.Fieldset>
		</Form.Root>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>
				{m.cancel()}
			</AlertDialog.Cancel>
			<AlertDialog.Action disabled={invalid || isDeleting} onclick={handleDelete}>
				{m.confirm()}
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

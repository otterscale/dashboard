<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Trash2 } from '@lucide/svelte';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/stores';
	import { ResourceService } from '$lib/api/resource/v1/resource_pb';
	import * as Form from '$lib/components/custom/form';
	import { Single as SingleInput } from '$lib/components/custom/input';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';
	import { role } from '$lib/stores';

	let {
		name,
		onOpenChangeComplete,
		onsuccess
	}: {
		name: string;
		onOpenChangeComplete: () => void;
		onsuccess?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);
	const cluster = $derived($page.params.cluster ?? $page.params.scope ?? '');

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
					namespace: $page.url.searchParams.get('namespace') ?? '',
					group: '',
					version: 'v1',
					resource: 'resourcequotas',
					name: name
				});
			},
			{
				loading: `Deleting resource quota ${name}...`,
				success: () => {
					isDeleting = false;
					open = false;
					onsuccess?.();
					// Redirect after delete
					goto(
						resolve(
							`/(auth)/${cluster}/ResourceQuota?group=&version=v1&namespace=${$page.url.searchParams.get('namespace') ?? ''}&resource=resourcequotas`
						)
					);
					return `Successfully deleted resource quota ${name}`;
				},
				error: (err) => {
					isDeleting = false;
					console.error('Failed to delete resource quota:', err);
					return `Failed to delete resource quota: ${(err as ConnectError).message}`;
				}
			}
		);
	}
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
		disabled={$role === 'view'}
		class="w-full text-destructive **:text-destructive disabled:opacity-50"
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
		<AlertDialog.Header>Delete Resource Quota</AlertDialog.Header>
		<Form.Root>
			<Form.Fieldset>
				<Form.Field>
					<Form.Label>Resource Quota Name</Form.Label>
					<Form.Help>
						{m.deletion_warning({ identifier: 'Resource Quota' })}
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

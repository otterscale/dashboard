<script lang="ts">
	import type { ConnectError } from '@connectrpc/connect';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { Trash2 } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { page } from '$app/state';
	import * as Form from '$lib/components/custom/form';
	import { Single as SingleInput } from '$lib/components/custom/input';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Item from '$lib/components/ui/item';

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
	const cluster = $derived(page.params.cluster ?? '');

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
					namespace: page.url.searchParams.get('namespace') ?? '',
					group: 'apps.otterscale.io',
					version: 'v1alpha1',
					resource: 'simpleapps',
					name: name
				});
			},
			{
				loading: `Deleting simpleapp ${name}...`,
				success: () => {
					isDeleting = false;
					open = false;
					onsuccess?.();
					return `Successfully deleted simpleapp ${name}`;
				},
				error: (err) => {
					isDeleting = false;
					console.error('Failed to delete simpleapp:', err);
					return `Failed to delete simpleapp: ${(err as ConnectError).message}`;
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
	<AlertDialog.Trigger class="w-full text-destructive **:text-destructive">
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
		<AlertDialog.Header>Delete SimpleApp</AlertDialog.Header>
		<Form.Root>
			<Form.Fieldset>
				<Form.Field>
					<Form.Label>SimpleApp Name</Form.Label>
					<Form.Help>
						This action cannot be undone. Please type <strong>{name}</strong> to confirm deletion.
					</Form.Help>
					<SingleInput.Confirm required target={name} bind:value={confirmName} bind:invalid />
				</Form.Field>
			</Form.Fieldset>
		</Form.Root>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action disabled={invalid || isDeleting} onclick={handleDelete}>
				Confirm
			</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>

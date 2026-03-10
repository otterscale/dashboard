<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { Trash2 } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import * as Form from '$lib/components/custom/form';
	import { Single as SingleInput } from '$lib/components/custom/input';
	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';

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
				const namespace = page.url.searchParams.get('namespace');
				if (!namespace) {
					throw new Error('Namespace is required but not found in searchParams.');
				}

				await resourceClient.delete({
					cluster: page.params.cluster!,
					namespace,
					group: 'batch', // Changed from tenant.otterscale.io
					version: 'v1', // Changed from v1alpha1
					resource: 'cronjobs', // Changed from workspaces
					name: name
				});
			},
			{
				loading: `Deleting cronjob ${name}...`,
				success: () => {
					isDeleting = false;
					open = false;
					onsuccess?.();
					return `Successfully deleted cronjob ${name}`;
				},
				error: (err) => {
					isDeleting = false;
					console.error('Failed to delete cronjob:', err);
					return `Failed to delete cronjob: ${(err as ConnectError).message}`;
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
		<AlertDialog.Header>Delete CronJob</AlertDialog.Header>
		<Form.Root>
			<Form.Fieldset>
				<Form.Field>
					<Form.Label>CronJob Name</Form.Label>
					<Form.Help>
						{m.deletion_warning({ identifier: 'CronJob' })}
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

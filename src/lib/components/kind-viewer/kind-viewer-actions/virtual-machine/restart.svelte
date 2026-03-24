<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { RotateCcwIcon } from '@lucide/svelte';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		namespace,
		version,
		resource,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		version: string;
		resource: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');
	const printableStatus: string = $derived(object?.status?.printableStatus ?? '');
	const isRunning = $derived(printableStatus === 'Running');

	let open = $state(false);
	let isSubmitting = $state(false);

	function handleRestart() {
		if (isSubmitting) return;
		isSubmitting = true;

		toast.promise(
			async () => {
				await client.subResourceAction({
					cluster,
					group: 'subresources.kubevirt.io',
					version,
					resource,
					namespace,
					name,
					subresource: 'restart',
					method: 'PUT',
					body: new Uint8Array()
				});
			},
			{
				loading: `Restarting virtual machine ${name}...`,
				success: () => {
					return `Successfully restarted virtual machine ${name}`;
				},
				error: (error) => {
					console.error(`Failed to restart virtual machine ${name}:`, error);
					return `Failed to restart virtual machine ${name}: ${(error as ConnectError).message}`;
				},
				finally() {
					isSubmitting = false;
					open = false;
				}
			}
		);
	}
</script>

<AlertDialog.Root bind:open {onOpenChangeComplete}>
	<AlertDialog.Trigger>
		{#snippet child({ props })}
			<Item.Root
				{...props}
				class="w-full p-0 text-xs {!isRunning ? 'pointer-events-none opacity-50' : ''}"
				size="sm"
			>
				<Item.Media>
					<RotateCcwIcon />
				</Item.Media>
				<Item.Content>
					<Item.Title>Restart</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[23vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Restart Virtual Machine</Item.Title>
				<Item.Description>
					Are you sure you want to restart virtual machine <strong>{name}</strong>
					in namespace <strong>{namespace}</strong>? This will stop and start the VM.
				</Item.Description>
			</Item.Content>
		</Item.Root>
		<div class="flex justify-end gap-2">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<Button disabled={isSubmitting || !isRunning} onclick={() => handleRestart()}>
				{#if isSubmitting}
					Restarting...
				{:else}
					Restart
				{/if}
			</Button>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

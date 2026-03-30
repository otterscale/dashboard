<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { PauseIcon, PlayIcon } from '@lucide/svelte';
	import { RuntimeService } from '@otterscale/api/runtime/v1';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import * as AlertDialog from '$lib/components/ui/alert-dialog';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Item from '$lib/components/ui/item';

	import { canPauseOrResume } from './vm-status';

	let {
		cluster,
		namespace,
		version,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
		version: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(RuntimeService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');
	const printableStatus: string = $derived(object?.status?.printableStatus ?? '');
	const isPaused = $derived(printableStatus === 'Paused');
	const isActionAllowed = $derived(canPauseOrResume(printableStatus));

	let open = $state(false);
	let isSubmitting = $state(false);

	function handleAction() {
		if (isSubmitting) return;
		isSubmitting = true;

		// KubeVirt uses "pause" and "unpause" subresources on virtualmachineinstances
		const action = isPaused ? 'unpause' : 'pause';
		const actionLabel = isPaused ? 'Resuming' : 'Pausing';
		const successLabel = isPaused ? 'resumed' : 'paused';

		toast.promise(
			async () => {
				await client.subResourceAction({
					cluster,
					group: 'subresources.kubevirt.io',
					version,
					resource: 'virtualmachineinstances',
					namespace,
					name,
					subresource: action,
					method: 'PUT',
					body: new Uint8Array()
				});
			},
			{
				loading: `${actionLabel} virtual machine ${name}...`,
				success: () => {
					return `Successfully ${successLabel} virtual machine ${name}`;
				},
				error: (error) => {
					console.error(`Failed to ${action} virtual machine ${name}:`, error);
					return `Failed to ${action} virtual machine ${name}: ${(error as ConnectError).message}`;
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
				class="w-full p-0 text-xs {!isActionAllowed ? 'pointer-events-none opacity-50' : ''}"
				size="sm"
			>
				<Item.Media>
					{#if isPaused}
						<PlayIcon />
					{:else}
						<PauseIcon />
					{/if}
				</Item.Media>
				<Item.Content>
					<Item.Title>{isPaused ? 'Resume' : 'Pause'}</Item.Title>
				</Item.Content>
			</Item.Root>
		{/snippet}
	</AlertDialog.Trigger>
	<AlertDialog.Content class="max-h-[95vh] min-w-[23vw] overflow-auto">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold"
					>{isPaused ? 'Resume' : 'Pause'} Virtual Machine</Item.Title
				>
				<Item.Description>
					Are you sure you want to {isPaused ? 'resume' : 'pause'} virtual machine
					<strong>{name}</strong>
					in namespace <strong>{namespace}</strong>?
				</Item.Description>
			</Item.Content>
		</Item.Root>
		<div class="flex justify-end gap-2">
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<Button disabled={isSubmitting || !isActionAllowed} onclick={() => handleAction()}>
				{#if isSubmitting}
					Processing...
				{:else}
					{isPaused ? 'Resume' : 'Pause'}
				{/if}
			</Button>
		</div>
	</AlertDialog.Content>
</AlertDialog.Root>

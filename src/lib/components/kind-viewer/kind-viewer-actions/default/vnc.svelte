<script lang="ts">
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MonitorIcon from '@lucide/svelte/icons/monitor';

	import { VncViewer } from '$lib/components/applications/vnc';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const vmiName: string = $derived(object?.metadata?.name ?? '');

	let open = $state(false);
	let showVnc = $state(false);
	let fullscreen = $state(false);

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			showVnc = true;
		} else {
			showVnc = false;
			fullscreen = false;
		}
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<MonitorIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>VNC</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content
		class="flex flex-col gap-3 {fullscreen
			? 'h-screen max-h-screen w-screen max-w-none rounded-none p-4 ring-0 sm:max-w-none'
			: 'h-fit max-h-[85vh] max-w-[80vw] min-w-[60vw] sm:max-w-[80vw]'}"
	>
		<Dialog.Header class="flex flex-row items-center justify-between">
			<div>
				<Dialog.Title>VNC Console — {vmiName}</Dialog.Title>
				<Dialog.Description>
					VNC console for VirtualMachine in namespace <strong>{namespace}</strong>
				</Dialog.Description>
			</div>
			<Button
				size="icon"
				variant="ghost"
				class="shrink-0"
				aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
				onclick={() => (fullscreen = !fullscreen)}
			>
				{#if fullscreen}
					<MinimizeIcon size={16} />
				{:else}
					<MaximizeIcon size={16} />
				{/if}
			</Button>
		</Dialog.Header>

		<div
			class="overflow-hidden rounded-md border bg-[#282828] {fullscreen ? 'flex-1' : 'h-[65vh]'}"
		>
			{#if showVnc}
				<VncViewer {cluster} {namespace} name={vmiName} />
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

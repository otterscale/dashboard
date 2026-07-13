<script lang="ts">
	import CableIcon from '@lucide/svelte/icons/cable';
	import MaximizeIcon from '@lucide/svelte/icons/maximize';
	import MinimizeIcon from '@lucide/svelte/icons/minimize';
	import MonitorIcon from '@lucide/svelte/icons/monitor';
	import UnplugIcon from '@lucide/svelte/icons/unplug';

	import { VncViewer } from '$lib/components/applications/vnc';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import { ACTION_DIALOG_CONTENT_FIT_CLASS } from './constants';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const vmiName: string = $derived(object?.metadata?.name ?? '');

	let open = $state(false);
	let showVnc = $state(false);
	let fullscreen = $state(false);
	let connected = $state(false);
	let vncKey = $state(0);

	function reconnect() {
		vncKey += 1;
	}

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			showVnc = true;
		} else {
			showVnc = false;
			fullscreen = false;
			connected = false;
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
		class={fullscreen
			? 'flex h-screen max-h-screen w-screen max-w-none flex-col gap-3 rounded-none p-4 ring-0 sm:max-w-none'
			: ACTION_DIALOG_CONTENT_FIT_CLASS}
	>
		<Dialog.Header>
			<div class="flex items-end justify-between gap-4">
				<div class="flex flex-col gap-1.5 text-left">
					<Dialog.Title class="text-lg font-bold">VNC Console — {vmiName}</Dialog.Title>
					<Dialog.Description>
						VNC console for VirtualMachine in namespace <strong>{namespace}</strong>
					</Dialog.Description>
				</div>
				<!-- -mr-2 lines the icon column up with the dialog's close button (right-4 vs p-6). -->
				<div class="-mr-2 flex shrink-0 items-center gap-1">
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									onclick={reconnect}
									aria-label={connected ? 'Connected' : 'Reconnect'}
								>
									{#if connected}
										<CableIcon />
									{:else}
										<UnplugIcon class="text-destructive" />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{connected ? 'Connected' : 'Reconnect'}</Tooltip.Content>
					</Tooltip.Root>
					<Tooltip.Root ignoreNonKeyboardFocus>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									size="icon-sm"
									variant="ghost"
									aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
									onclick={() => (fullscreen = !fullscreen)}
								>
									{#if fullscreen}
										<MinimizeIcon />
									{:else}
										<MaximizeIcon />
									{/if}
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>{fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</Tooltip.Content>
					</Tooltip.Root>
				</div>
			</div>
		</Dialog.Header>

		<div
			class="overflow-hidden rounded-md border bg-[#282828] {fullscreen ? 'flex-1' : 'h-[65vh]'}"
		>
			{#if showVnc}
				{#key vncKey}
					<VncViewer
						{cluster}
						{namespace}
						name={vmiName}
						onConnectionChange={(v) => (connected = v)}
					/>
				{/key}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

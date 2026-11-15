<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import DownloadIcon from '@lucide/svelte/icons/download';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { toast } from 'svelte-sonner';

	import * as Alert from '$lib/components/ui/alert/index.js';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import { m } from '$lib/messages';

	let {
		open = $bindable(false),
		name,
		clientId = '',
		plainKey,
		onClosed
	}: {
		open: boolean;
		name: string;
		clientId?: string;
		plainKey: string;
		onClosed?: () => void;
	} = $props();

	let copied = $state(false);

	async function copyKey() {
		try {
			await navigator.clipboard.writeText(plainKey);
			copied = true;
			toast.success(m.api_key_copied());
			setTimeout(() => (copied = false), 2000);
		} catch {
			toast.error(m.api_key_copy_failed());
		}
	}

	function downloadKey() {
		const blob = new Blob([`${plainKey}\n`], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement('a');
		anchor.href = url;
		anchor.download = `${clientId || name}.key`;
		anchor.click();
		URL.revokeObjectURL(url);
	}
</script>

<Dialog.Root
	bind:open
	onOpenChangeComplete={(isOpen) => {
		if (isOpen) return;
		copied = false;
		onClosed?.();
	}}
>
	<Dialog.Content
		class="max-h-[95vh] min-w-[28vw] overflow-auto"
		onInteractOutside={(e) => e.preventDefault()}
	>
		<Dialog.Header>
			<Dialog.Title class="text-xl font-bold">{m.api_key_reveal_title({ name })}</Dialog.Title>
			<Dialog.Description>
				{#if clientId}
					{m.api_key_client_id()}: <span class="font-mono">{clientId}</span>
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<Alert.Root variant="destructive" class="border-none bg-destructive/5">
			<TriangleAlertIcon class="size-4" />
			<Alert.Title class="font-bold">{m.api_key_reveal_once()}</Alert.Title>
			<Alert.Description class="text-start">
				{m.api_key_reveal_description()}
			</Alert.Description>
		</Alert.Root>

		<code class="rounded-md border bg-muted px-3 py-2 font-mono text-sm break-all select-all">
			{plainKey}
		</code>

		<div class="flex items-center gap-2">
			<Button variant="outline" onclick={copyKey}>
				{#if copied}
					<CheckIcon class="size-4" />
				{:else}
					<CopyIcon class="size-4" />
				{/if}
				{m.api_key_copy()}
			</Button>
			<Button variant="outline" onclick={downloadKey}>
				<DownloadIcon class="size-4" />
				{m.api_key_download()}
			</Button>
		</div>

		<Dialog.Footer>
			<Button onclick={() => (open = false)}>{m.api_key_saved_ack()}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

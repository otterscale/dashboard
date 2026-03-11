<script lang="ts">
	import { TerminalSquareIcon } from '@lucide/svelte';

	import { Terminal } from '$lib/components/applications/terminal';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';

	let {
		cluster,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	// Derived from the raw K8s object
	const namespace: string = $derived(object?.metadata?.namespace ?? '');
	const podName: string = $derived(object?.metadata?.name ?? '');
	const containers: string[] = $derived(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		(object?.spec?.containers as any[])?.map((c: any) => c.name as string) ?? []
	);

	let selectedContainer = $state(containers[0] ?? '');
	let open = $state(false);
	let showTerminal = $state(false);

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			showTerminal = true;
		} else {
			showTerminal = false;
		}
	}
</script>

<Dialog.Root
	bind:open
	{onOpenChangeComplete}
	onOpenChange={handleOpenChange}
>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<TerminalSquareIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>Exec</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class="flex max-h-[85vh] max-w-[80vw] min-w-[60vw] flex-col gap-3 p-0">
		<Dialog.Header class="px-6 pt-6">
			<Dialog.Title>Terminal — {podName}</Dialog.Title>
			<Dialog.Description>
				Interactive shell in namespace <strong>{namespace}</strong>
			</Dialog.Description>
		</Dialog.Header>

		{#if containers.length > 1}
			<div class="flex items-center gap-2 px-6">
				<Select
					type="single"
					value={selectedContainer}
					onValueChange={(value) => {
						selectedContainer = value;
						// Re-mount terminal with new container
						showTerminal = false;
						setTimeout(() => (showTerminal = true), 50);
					}}
				>
					<SelectTrigger class="w-48">
						{selectedContainer || 'Select container'}
					</SelectTrigger>
					<SelectContent>
						{#each containers as c (c)}
							<SelectItem value={c}>{c}</SelectItem>
						{/each}
					</SelectContent>
				</Select>
			</div>
		{/if}

		<div class="h-[60vh] overflow-hidden px-2 pb-2">
			{#if showTerminal && selectedContainer}
				<Terminal
					{cluster}
					{namespace}
					podName={podName}
					containerName={selectedContainer}
					command={['/bin/sh']}
				/>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

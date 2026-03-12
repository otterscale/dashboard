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
		((object?.spec?.containers || object?.spec?.template?.spec?.containers) as any[])?.map(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(c: any) => c.name as string
		) ?? []
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

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<TerminalSquareIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>Terminal</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class="flex h-fit max-h-[80vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Terminal — {podName}</Dialog.Title>
			<Dialog.Description>
				Interactive shell in namespace <strong>{namespace}</strong>
			</Dialog.Description>
		</Dialog.Header>

		{#if containers.length > 1}
			<div class="flex items-center gap-2">
				<Select
					type="single"
					value={selectedContainer}
					onValueChange={(value) => {
						if (value) selectedContainer = value;
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

		<div class="h-[55vh] overflow-hidden rounded-md border bg-[#1e1e1e] p-3">
			{#if showTerminal && selectedContainer}
				{#key selectedContainer}
					<Terminal
						{cluster}
						{namespace}
						{podName}
						containerName={selectedContainer}
						command={['/bin/sh']}
					/>
				{/key}
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

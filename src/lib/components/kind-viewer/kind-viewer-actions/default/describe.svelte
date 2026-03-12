<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { FileSearchIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Resource } from '@otterscale/api/resource/v1/resource_pb';
	import { getContext } from 'svelte';

	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	import { formatPodDescribe } from './describe-formatter';

	let {
		cluster,
		namespace = '',
		group,
		version,
		resource,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace?: string;
		group: string;
		version: string;
		resource: string;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		object: any;
		onOpenChangeComplete?: () => void;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const name: string = $derived(object?.metadata?.name ?? '');

	let open = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);
	let describeText = $state<string>('');

	async function fetchDescribe() {
		isLoading = true;
		error = null;
		describeText = '';

		try {
			const response = await client.describe({
				cluster,
				group,
				version,
				resource,
				namespace,
				name
			});

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const pod = (response.resource?.object as Record<string, any>) ?? {};
			const events = (response.events ?? []).map((e: Resource) => e.object ?? e);
			describeText = formatPodDescribe(pod, events);
		} catch (err) {
			console.error(`Failed to describe ${name}:`, err);
			error = `Failed to describe ${name}: ${(err as ConnectError).message}`;
		} finally {
			isLoading = false;
		}
	}

	function handleOpenChange(isOpen: boolean) {
		if (isOpen) {
			fetchDescribe();
		}
	}
</script>

<Dialog.Root bind:open {onOpenChangeComplete} onOpenChange={handleOpenChange}>
	<Dialog.Trigger class="w-full">
		<Item.Root class="p-0 text-xs" size="sm">
			<Item.Media>
				<FileSearchIcon />
			</Item.Media>
			<Item.Content>
				<Item.Title>Describe</Item.Title>
			</Item.Content>
		</Item.Root>
	</Dialog.Trigger>
	<Dialog.Content class="flex h-fit max-h-[90vh] max-w-[70vw] min-w-[55vw] flex-col gap-3">
		<Dialog.Header>
			<Dialog.Title>Describe — {name}</Dialog.Title>
			<Dialog.Description>
				{#if namespace}
					Resource details and events in namespace <strong>{namespace}</strong>
				{:else}
					Resource details and events
				{/if}
			</Dialog.Description>
		</Dialog.Header>

		<div class="flex-1 overflow-auto">
			{#if isLoading}
				<div
					class="flex h-[60vh] items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground"
				>
					Loading...
				</div>
			{:else if error}
				<div
					class="flex h-[60vh] items-center justify-center rounded-md border bg-muted text-xs text-destructive"
				>
					{error}
				</div>
			{:else}
				<pre
					class="max-h-[70vh] w-full overflow-auto rounded-md border bg-muted p-4 font-mono text-[11px] leading-relaxed whitespace-pre text-foreground">{describeText}</pre>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

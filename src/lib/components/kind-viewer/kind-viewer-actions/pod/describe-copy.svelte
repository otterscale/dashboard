<script lang="ts">
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import { FileSearchIcon } from '@lucide/svelte';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { Resource } from '@otterscale/api/resource/v1/resource_pb';
	import { getContext } from 'svelte';
	import { stringify } from 'yaml';

	import * as Code from '$lib/components/custom/code';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';

	let {
		cluster,
		namespace,
		group,
		version,
		resource,
		object,
		onOpenChangeComplete
	}: {
		cluster: string;
		namespace: string;
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
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let resourceDetail = $state<Record<string, any> | null>(null);
	let events = $state<Resource[]>([]);

	function formatAge(timestamp: string | undefined): string {
		if (!timestamp) return 'Unknown';
		const now = Date.now();
		const then = new Date(timestamp).getTime();
		const diffMs = now - then;
		const diffSec = Math.floor(diffMs / 1000);
		if (diffSec < 60) return `${diffSec}s`;
		const diffMin = Math.floor(diffSec / 60);
		if (diffMin < 60) return `${diffMin}m`;
		const diffHour = Math.floor(diffMin / 60);
		if (diffHour < 24) return `${diffHour}h`;
		const diffDay = Math.floor(diffHour / 24);
		return `${diffDay}d`;
	}

	async function fetchDescribe() {
		isLoading = true;
		error = null;
		resourceDetail = null;
		events = [];

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
			resourceDetail = (response.resource?.object as Record<string, any>) ?? null;
			events = response.events ?? [];
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
				Resource details and events in namespace <strong>{namespace}</strong>
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
				<!-- Resource Details -->
				{#if resourceDetail}
					<div class="mb-4">
						<h3 class="mb-2 text-sm font-semibold">Resource</h3>
						<Code.Root
							variant="secondary"
							lang="yaml"
							code={stringify(resourceDetail)}
							class="max-h-[50vh] w-full overflow-auto border-none text-[11px]"
						/>
					</div>
				{/if}

				<!-- Events -->
				<div>
					<h3 class="mb-2 text-sm font-semibold">Events</h3>
					{#if events.length === 0}
						<div
							class="rounded-md border bg-muted p-4 text-center text-sm text-muted-foreground"
						>
							No events found.
						</div>
					{:else}
						<div class="max-h-[30vh] overflow-auto rounded-md border">
							<table class="w-full text-left text-[11px]">
								<thead class="sticky top-0 bg-muted text-muted-foreground">
									<tr>
										<th class="px-3 py-2 font-medium">Type</th>
										<th class="px-3 py-2 font-medium">Reason</th>
										<th class="px-3 py-2 font-medium">Age</th>
										<th class="px-3 py-2 font-medium">From</th>
										<th class="px-3 py-2 font-medium">Message</th>
									</tr>
								</thead>
								<tbody>
									{#each events as event, i (i)}
										{@const obj = event.object as Record<string, any>}
										<tr class="border-t hover:bg-muted/50">
											<td class="px-3 py-2"
												><span
													class="inline-block rounded px-1.5 py-0.5 text-xs font-medium {obj?.type ===
													'Warning'
														? 'bg-destructive/10 text-destructive'
														: 'bg-primary/10 text-primary'}"
												>
													{obj?.type ?? '—'}
												</span></td
											>
											<td class="px-3 py-2">{obj?.reason ?? '—'}</td>
											<td class="px-3 py-2 whitespace-nowrap"
												>{formatAge(obj?.lastTimestamp ?? obj?.metadata?.creationTimestamp)}</td
											>
											<td class="px-3 py-2 whitespace-nowrap"
												>{obj?.source?.component ?? obj?.reportingComponent ?? '—'}</td
											>
											<td class="px-3 py-2">{obj?.message ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
		</div>
	</Dialog.Content>
</Dialog.Root>

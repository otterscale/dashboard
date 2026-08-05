<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { ConnectError, createClient, type Transport } from '@connectrpc/connect';
	import Trash2Icon from '@lucide/svelte/icons/trash-2';
	import { type APIResource, ResourceService } from '@otterscale/api/resource/v1';
	import type { Row, Table } from '@tanstack/table-core';
	import { getContext } from 'svelte';
	import { toast } from 'svelte-sonner';

	import Button from '$lib/components/ui/button/button.svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Item from '$lib/components/ui/item';
	import { Spinner } from '$lib/components/ui/spinner/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';

	let {
		table,
		cluster,
		namespace,
		apiResource
	}: {
		table: Table<Record<string, JsonValue>>;
		cluster: string;
		namespace?: string;
		apiResource: APIResource;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	const selectedRows = $derived(table.getFilteredSelectedRowModel().rows);

	let open = $state(false);
	let isSubmitting = $state(false);

	function getName(row: Row<Record<string, JsonValue>>): string {
		return row.original['Name'] as string;
	}

	function getNamespace(row: Row<Record<string, JsonValue>>): string | undefined {
		if (!apiResource.namespaced) return undefined;

		return (
			(row.original.raw as Record<string, Record<string, string>>)?.metadata?.namespace || namespace
		);
	}

	async function handleDelete(row: Row<Record<string, JsonValue>>): Promise<string> {
		const name = getName(row);

		await resourceClient.delete({
			cluster,
			namespace: getNamespace(row),
			group: apiResource.group,
			version: apiResource.version,
			resource: apiResource.resource,
			name
		});

		return name;
	}

	async function handleBulkDelete() {
		if (isSubmitting) return;
		isSubmitting = true;

		const results = await Promise.allSettled(selectedRows.map((row) => handleDelete(row)));

		let successes = 0;
		let fails = 0;

		for (const result of results) {
			if (result.status === 'fulfilled') {
				successes += 1;
				toast.success(`Deletion requested for ${apiResource.kind.toLowerCase()} ${result.value}`);
			} else {
				fails += 1;
				const message =
					result.reason instanceof ConnectError ? result.reason.message : String(result.reason);
				toast.error(`Failed to delete: ${message}`);
			}
		}

		if (fails === 0) {
			toast.success(`${successes} ${apiResource.kind}(s) deletion requested`);
		} else {
			toast.warning(`${successes} deletion requested, ${fails} failed`);
		}

		table.resetRowSelection();
		isSubmitting = false;
		open = false;
	}
</script>

{#if selectedRows.length > 0}
	<Dialog.Root bind:open>
		<Tooltip.Root>
			<Tooltip.Trigger>
				<Dialog.Trigger>
					{#snippet child({ props })}
						<Button variant="outline" {...props}>
							<Trash2Icon size={16} class="text-destructive" />
						</Button>
					{/snippet}
				</Dialog.Trigger>
			</Tooltip.Trigger>
			<Tooltip.Content>Bulk Delete</Tooltip.Content>
		</Tooltip.Root>
		<Dialog.Content class="max-h-[80vh] overflow-auto">
			<Dialog.Header>
				<Item.Root class="p-0">
					<Item.Content class="text-left">
						<Item.Title class="text-xl font-bold">Bulk Delete</Item.Title>
						<Item.Description>
							Delete selected {apiResource.kind.toLowerCase()}(s) in cluster {cluster}. This action
							cannot be undone.
						</Item.Description>
					</Item.Content>
				</Item.Root>
			</Dialog.Header>
			<div class="space-y-2">
				{#each selectedRows as row (row.id)}
					<Item.Root class="p-0">
						<Item.Content class="text-left">
							<Item.Title class="text-sm font-medium">
								{getName(row)}
							</Item.Title>
							{#if apiResource.namespaced}
								<Item.Description class="text-xs">
									{getNamespace(row)}
								</Item.Description>
							{/if}
						</Item.Content>
					</Item.Root>
				{/each}
			</div>
			<Dialog.Footer>
				<Button onclick={handleBulkDelete} disabled={isSubmitting} class="w-full">
					{#if isSubmitting}
						<Spinner />
					{/if}
					Delete
				</Button>
			</Dialog.Footer>
		</Dialog.Content>
	</Dialog.Root>
{/if}

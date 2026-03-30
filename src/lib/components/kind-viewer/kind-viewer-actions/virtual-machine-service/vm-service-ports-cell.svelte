<script lang="ts">
	import type { JsonObject } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { Plus } from '@lucide/svelte';
	import Braces from '@lucide/svelte/icons/braces';
	import ChevronFirst from '@lucide/svelte/icons/chevron-first';
	import ChevronLast from '@lucide/svelte/icons/chevron-last';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';
	import File from '@lucide/svelte/icons/file';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import {
		type ColumnDef,
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		type PaginationState
	} from '@tanstack/table-core';
	import { getContext, onMount } from 'svelte';
	import { stringify } from 'yaml';

	import * as CodeBlock from '$lib/components/custom/code/index.js';
	import type {
		ArrayOfObjectItemsType,
		ArrayOfObjectItemType
	} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Collapsible from '$lib/components/ui/collapsible';
	import { createSvelteTable } from '$lib/components/ui/data-table';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import * as Sheet from '$lib/components/ui/sheet/index.js';

	import CreateService from './create.svelte';
	import UpdateService from './update.svelte';

	let {
		vmName,
		vmNamespace,
		cluster
	}: {
		vmName: string;
		vmNamespace: string;
		cluster: string;
	} = $props();

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	// Service data
	let service: any = $state(null);
	let servicePorts: ArrayOfObjectItemsType = $state([]);
	let portsCount = $derived(servicePorts.length);

	async function fetchService() {
		try {
			const response = await resourceClient.list({
				cluster,
				namespace: vmNamespace,
				group: '',
				version: 'v1',
				resource: 'services',
				labelSelector: `otterscale.com/virtual-machine.name=${vmName}`
			});

			const matchedService = response.items[0] ?? null;

			if (matchedService) {
				service = matchedService.object;
				const ports = (service as any)?.spec?.ports ?? [];
				servicePorts = ports.map((p: any) => ({
					title: p.name ?? `${p.port}`,
					description: `${p.port}${p.nodePort ? `:${p.nodePort}` : ''}/${p.protocol ?? 'TCP'}`,
					raw: p as JsonObject
				}));
			} else {
				service = null;
				servicePorts = [];
			}
		} catch (error) {
			console.error('Error fetching services for VM:', vmName, error);
			service = null;
			servicePorts = [];
		}
	}

	onMount(() => {
		fetchService();
	});

	// Table for Sheet
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize: 10 });

	const columns: ColumnDef<ArrayOfObjectItemType>[] = [
		{
			id: 'item',
			accessorFn: (row) => row,
			cell: ({ row }) => row.original
		}
	];

	let table = createSvelteTable<ArrayOfObjectItemType>({
		columns,
		get data() {
			return servicePorts;
		},
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onPaginationChange: (updater) => {
			if (typeof updater === 'function') {
				pagination = updater(pagination);
			} else {
				pagination = updater;
			}
		},
		state: {
			get pagination() {
				return pagination;
			}
		}
	});

	// Create/Update dialog state
	let createOpen = $state(false);
	let updateOpen = $state(false);
</script>

<Sheet.Root>
	<Sheet.Trigger>
		<Button variant="ghost" class="hover:underline">
			{portsCount}
		</Button>
	</Sheet.Trigger>
	<Sheet.Content
		side="right"
		class="flex h-full max-w-[50vw] min-w-[38vw] flex-col gap-0 overflow-y-auto p-4"
	>
		<Sheet.Header class="shrink-0 space-y-4">
			<div class="flex items-center justify-between">
				<Sheet.Title>Ports</Sheet.Title>
				{#if service}
					<Button variant="outline" size="sm" onclick={() => (updateOpen = true)}>Update</Button>
				{:else}
					<Button variant="outline" size="sm" onclick={() => (createOpen = true)}>
						<Plus class="mr-1 size-4" />
						Create
					</Button>
				{/if}
			</div>
		</Sheet.Header>

		{#if table.getRowModel().rows.length > 0}
			<div class="flex-1 space-y-0 overflow-y-auto p-4">
				{#each table.getRowModel().rows as row (row.id)}
					{@const item = row.original}
					<Collapsible.Root class="rounded-lg transition-colors duration-200 hover:bg-muted/50">
						<Collapsible.Trigger class="w-full transition-colors duration-200 hover:underline">
							<Item.Root size="sm">
								<Item.Media variant="icon">
									<File />
								</Item.Media>
								<Item.Content class="min-w-0 flex-1 text-left">
									<Item.Title class="w-full">
										{item.title}
									</Item.Title>
									<Item.Description class="wrap-break-words breaks-all">
										{item.description}
									</Item.Description>
								</Item.Content>
								<Item.Actions>
									{item.actions}
								</Item.Actions>
							</Item.Root>
						</Collapsible.Trigger>
						{#if item.raw}
							<Collapsible.Content class="overflow-hidden transition-all duration-300 ease-in-out">
								<CodeBlock.Root
									lang="yaml"
									hideLines
									code={stringify(item.raw, null, 4)}
									class="border-none bg-transparent px-8"
								/>
							</Collapsible.Content>
						{/if}
					</Collapsible.Root>
				{/each}
			</div>

			<!-- Pagination -->
			<div class="mt-4 flex shrink-0 items-center justify-between gap-4 border-t pt-4">
				<div class="flex items-center gap-2">
					<Label class="text-sm">Rows per page</Label>
					<Select
						type="single"
						value={table.getState().pagination.pageSize.toString()}
						onValueChange={(value) => table.setPageSize(Number(value))}
					>
						<SelectTrigger class="w-fit">
							{table.getState().pagination.pageSize}
						</SelectTrigger>
						<SelectContent>
							{#each [5, 10, 25, 50] as size (size)}
								<SelectItem value={size.toString()}>{size}</SelectItem>
							{/each}
						</SelectContent>
					</Select>
				</div>

				<p class="text-sm text-muted-foreground">
					<span class="text-foreground">
						{table.getState().pagination.pageIndex * table.getState().pagination.pageSize +
							1}-{Math.min(
							(table.getState().pagination.pageIndex + 1) * table.getState().pagination.pageSize,
							table.getFilteredRowModel().rows.length
						)}
					</span>
					of
					<span class="text-foreground">{table.getFilteredRowModel().rows.length}</span>
				</p>

				<div class="flex items-center gap-1">
					<Button
						size="icon"
						variant="outline"
						onclick={() => table.firstPage()}
						disabled={!table.getCanPreviousPage()}
						aria-label="Go to first page"
					>
						<ChevronFirst size={16} />
					</Button>
					<Button
						size="icon"
						variant="outline"
						onclick={() => table.previousPage()}
						disabled={!table.getCanPreviousPage()}
						aria-label="Go to previous page"
					>
						<ChevronLeft size={16} />
					</Button>
					<Button
						size="icon"
						variant="outline"
						onclick={() => table.nextPage()}
						disabled={!table.getCanNextPage()}
						aria-label="Go to next page"
					>
						<ChevronRight size={16} />
					</Button>
					<Button
						size="icon"
						variant="outline"
						onclick={() => table.lastPage()}
						disabled={!table.getCanNextPage()}
						aria-label="Go to last page"
					>
						<ChevronLast size={16} />
					</Button>
				</div>
			</div>
		{:else}
			<Empty.Root class="m-4 bg-muted/50">
				<Empty.Header>
					<Empty.Media variant="icon">
						<Braces size={36} />
					</Empty.Media>
					<Empty.Title>No Ports</Empty.Title>
					<Empty.Description>
						No service ports are associated with this virtual machine.
						<br />
						{#if !service}
							Click "Create Service" to expose ports for this VM.
						{/if}
					</Empty.Description>
				</Empty.Header>
			</Empty.Root>
		{/if}
	</Sheet.Content>
</Sheet.Root>

<!-- Create Service Dialog -->
<CreateService
	{cluster}
	namespace={vmNamespace}
	{vmName}
	bind:open={createOpen}
	onsuccess={() => {
		fetchService();
	}}
/>

<!-- Update Service Dialog -->
{#if service}
	<UpdateService
		{cluster}
		namespace={vmNamespace}
		{vmName}
		{service}
		bind:open={updateOpen}
		onsuccess={() => {
			fetchService();
		}}
	/>
{/if}

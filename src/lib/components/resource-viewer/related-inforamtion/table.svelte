<script lang="ts" generics="TData extends { id: string }">
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import { type ColumnDef, getCoreRowModel, getFilteredRowModel } from '@tanstack/table-core';
	import type { Snippet } from 'svelte';

	import { createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import * as Table from '$lib/components/ui/table/index.js';

	let {
		data,
		columns,
		loading,
		header,
		row
	}: {
		data: TData[];
		columns: ColumnDef<TData>[];
		loading?: boolean;
		header: Snippet;
		row: Snippet<[TData]>;
	} = $props();

	const placeholder = 'e.g., searchPattern';

	let globalFilter = $state('');

	const table = createSvelteTable<TData>({
		columns,
		get data() {
			return data;
		},
		getRowId: (dataRow) => dataRow.id,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		onGlobalFilterChange: (updater) => {
			globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater;
		},
		state: {
			get globalFilter() {
				return globalFilter;
			}
		},
		globalFilterFn: (dataRow, _columnId, filterValue) => {
			const term = String(filterValue ?? '')
				.trim()
				.toLowerCase();
			if (!term) return true;
			return Object.values(dataRow.original as Record<string, unknown>).some((value) =>
				String(value ?? '')
					.toLowerCase()
					.includes(term)
			);
		}
	});
</script>

<div class="space-y-4">
	<div class="flex items-center gap-2">
		<InputGroup.Root>
			<InputGroup.Addon>
				<SearchIcon size={16} />
			</InputGroup.Addon>
			<InputGroup.Input
				{placeholder}
				value={globalFilter}
				oninput={(event) => table.setGlobalFilter((event.currentTarget as HTMLInputElement).value)}
			/>
			{#if globalFilter}
				<InputGroup.Addon align="inline-end">
					<InputGroup.Button
						size="icon-xs"
						onclick={() => table.setGlobalFilter('')}
						aria-label="Clear filter"
					>
						<XIcon />
					</InputGroup.Button>
				</InputGroup.Addon>
			{/if}
		</InputGroup.Root>
	</div>
	<div class="overflow-hidden rounded-md border bg-background">
		<Table.Root class="[&_td]:p-4 [&_th]:p-4">
			<Table.Header class="bg-muted">
				{@render header()}
			</Table.Header>
			<Table.Body class="[&_tr]:border-none">
				{#each table.getRowModel().rows as tableRow (tableRow.id)}
					{@render row(tableRow.original)}
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="text-center">
							<Empty.Root>
								<Empty.Header>
									<Empty.Media variant="icon">
										{#if loading}
											<Spinner />
										{:else}
											<SearchIcon />
										{/if}
									</Empty.Media>
									<Empty.Title>{loading ? 'Loading' : 'No Data'}</Empty.Title>
									<Empty.Description>
										{loading
											? 'Fetching the latest data, this should only take a moment.'
											: 'No matching records were found. Try adjusting your filters or search criteria.'}
									</Empty.Description>
								</Empty.Header>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</div>

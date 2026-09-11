<script lang="ts" generics="TData extends { id: string }">
	import SearchIcon from '@lucide/svelte/icons/search';
	import { type ColumnDef, getCoreRowModel, getFilteredRowModel } from '@tanstack/table-core';
	import type { Snippet } from 'svelte';

	import { createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import Spinner from '$lib/components/ui/spinner/spinner.svelte';
	import * as Table from '$lib/components/ui/table/index.js';

	let {
		data,
		columns,
		loading,
		filter = '',
		header,
		row
	}: {
		data: TData[];
		columns: ColumnDef<TData>[];
		loading?: boolean;
		/** Global search term; the input lives in the parent's toolbar row. */
		filter?: string;
		header: Snippet;
		row: Snippet<[TData]>;
	} = $props();

	const table = createSvelteTable<TData>({
		columns,
		get data() {
			return data;
		},
		getRowId: (dataRow) => dataRow.id,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		state: {
			get globalFilter() {
				return filter;
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

<script lang="ts" generics="TData extends { id: string }">
	import ChevronFirstIcon from '@lucide/svelte/icons/chevron-first';
	import ChevronLastIcon from '@lucide/svelte/icons/chevron-last';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		type ColumnDef,
		getCoreRowModel,
		getFilteredRowModel,
		getPaginationRowModel,
		type PaginationState
	} from '@tanstack/table-core';
	import type { Snippet } from 'svelte';

	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import { createSvelteTable } from '$lib/components/ui/data-table/index.js';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import * as Table from '$lib/components/ui/table/index.js';

	let {
		data,
		columns,
		loading = false,
		pageSize = 5,
		header,
		row
	}: {
		data: TData[];
		columns: ColumnDef<TData>[];
		loading?: boolean;
		pageSize?: number;
		header: Snippet;
		row: Snippet<[TData]>;
	} = $props();

	const placeholder = 'Filter…'
	const emptyMessage = 'No results.'
	const loadingMessage = 'Loading…'

	let globalFilter = $state('');
	let pagination = $state<PaginationState>({ pageIndex: 0, pageSize });

	const table = createSvelteTable<TData>({
		columns,
		get data() {
			return data;
		},
		getRowId: (dataRow) => dataRow.id,
		getCoreRowModel: getCoreRowModel(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		onGlobalFilterChange: (updater) => {
			globalFilter = typeof updater === 'function' ? updater(globalFilter) : updater;
			pagination = { ...pagination, pageIndex: 0 };
		},
		onPaginationChange: (updater) => {
			pagination = typeof updater === 'function' ? updater(pagination) : updater;
		},
		state: {
			get globalFilter() {
				return globalFilter;
			},
			get pagination() {
				return pagination;
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
		},
		autoResetPageIndex: false
	});

	const pageCount = $derived(Math.max(table.getPageCount(), 1));
	const pageNumbers = $derived(Array.from({ length: pageCount }, (_, index) => index + 1));
</script>

<div class="space-y-3">
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
		<Button
			variant="outline"
			size="icon"
			onclick={() => table.firstPage()}
			disabled={!table.getCanPreviousPage()}
			aria-label="First page"
		>
			<ChevronFirstIcon size={16} aria-hidden="true" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			onclick={() => table.previousPage()}
			disabled={!table.getCanPreviousPage()}
			aria-label="Previous page"
		>
			<ChevronLeftIcon size={16} aria-hidden="true" />
		</Button>
		<ButtonGroup.Root>
			<Select
				type="single"
				value={String(pagination.pageIndex + 1)}
				onValueChange={(value) => table.setPageIndex(Number(value) - 1)}
			>
				<SelectTrigger class="w-fit whitespace-nowrap" aria-label="Jump to page">
					{String(pagination.pageIndex + 1)}
				</SelectTrigger>
				<SelectContent>
					{#each pageNumbers as pageNumber (pageNumber)}
						<SelectItem value={String(pageNumber)}>{pageNumber}</SelectItem>
					{/each}
				</SelectContent>
			</Select>
			<Button size="icon" variant="outline">{String(pageNumbers.length)}</Button>
		</ButtonGroup.Root>
		<Button
			variant="outline"
			size="icon"
			onclick={() => table.nextPage()}
			disabled={!table.getCanNextPage()}
			aria-label="Next page"
		>
			<ChevronRightIcon size={16} aria-hidden="true" />
		</Button>
		<Button
			variant="outline"
			size="icon"
			onclick={() => table.lastPage()}
			disabled={!table.getCanNextPage()}
			aria-label="Last page"
		>
			<ChevronLastIcon size={16} aria-hidden="true" />
		</Button>
	</div>
	<div class="overflow-hidden rounded-md border bg-background">
		<Table.Root>
			<Table.Header class="bg-muted">
				{@render header()}
			</Table.Header>
			<Table.Body>
				{#if loading}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="text-center">{loadingMessage}</Table.Cell>
					</Table.Row>
				{:else}
					{#each table.getRowModel().rows as tableRow (tableRow.id)}
						{@render row(tableRow.original)}
					{:else}
						<Table.Row>
							<Table.Cell colspan={columns.length} class="text-center">{emptyMessage}</Table.Cell>
						</Table.Row>
					{/each}
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
</div>

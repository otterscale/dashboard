<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import CheckIcon from '@lucide/svelte/icons/check';
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import ChevronFirstIcon from '@lucide/svelte/icons/chevron-first';
	import ChevronLastIcon from '@lucide/svelte/icons/chevron-last';
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import ChevronUpIcon from '@lucide/svelte/icons/chevron-up';
	import CodeIcon from '@lucide/svelte/icons/code';
	import Columns3Icon from '@lucide/svelte/icons/columns-3';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import SheetIcon from '@lucide/svelte/icons/sheet';
	import {
		type ColumnDef,
		type ColumnFiltersState,
		type ColumnSizingState,
		getCoreRowModel,
		getFacetedUniqueValues,
		getFilteredRowModel,
		getPaginationRowModel,
		getSortedRowModel,
		type PaginationState,
		type Row,
		type RowSelectionState,
		type SortingState,
		type Table as TableType,
		type Table as TanStackTabke,
		type VisibilityState
	} from '@tanstack/table-core';
	import { type LiqeQuery, parse, test } from 'liqe';
	import lodash from 'lodash';
	import { createRawSnippet, type Snippet } from 'svelte';

	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { shortcut } from '$lib/actions/shortcut.svelte';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import {
		createSvelteTable,
		FlexRender,
		renderComponent,
		renderSnippet
	} from '$lib/components/ui/data-table';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as InputGroup from '$lib/components/ui/input-group/index.js';
	import * as Kbd from '$lib/components/ui/kbd/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Pagination from '$lib/components/ui/pagination/index.js';
	import { Select, SelectContent, SelectItem, SelectTrigger } from '$lib/components/ui/select';
	import * as Table from '$lib/components/ui/table';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { cn } from '$lib/utils';

	import DynamicTableSearchDocument from './dynamic-table-search-document.svelte';
	import type { UISchemaType } from './utils';

	let {
		data,
		columnDefinitions,
		uiSchemas,
		// dataSchemas,
		accessReview,
		create,
		bulkCreate,
		bulkDelete,
		reload,
		rowActions = createRawSnippet(() => ({ render: () => '' })),
		gridLayout
	}: {
		data: Record<string, JsonValue>[];
		columnDefinitions: ColumnDef<Record<string, JsonValue>>[];
		uiSchemas: Record<string, UISchemaType>;
		// dataSchemas: Record<string, DataSchemaType>;
		accessReview?: Snippet;
		create?: Snippet;
		bulkCreate?: Snippet<[{ table: TanStackTabke<Record<string, JsonValue>> }]>;
		bulkDelete?: Snippet<[{ table: TanStackTabke<Record<string, JsonValue>> }]>;
		rowActions?: Snippet<[{ row: Row<Record<string, JsonValue>> }]>;
		reload?: Snippet;
		gridLayout?: Snippet<
			[
				{
					table: TableType<Record<string, JsonValue>>;
					handleClear: () => void;
				}
			]
		>;
	} = $props();

	const PARAMETERS = {
		QUERY: 'query',
		VIEW: 'view',
		SORT: 'sort',
		PAGE: 'page',
		SIZE: 'size',
		HIDE: 'hide'
	} as const;

	const PAGE_SIZE = 9;
	const PAGE_SIZES = [9, 18, 45, 90];

	// svelte-ignore state_referenced_locally
	const hasGridlayout = !!gridLayout;
	const DEFAULT_MODE: 'table' | 'grid' = hasGridlayout ? 'grid' : 'table';

	const mode = $derived.by<'table' | 'grid'>(() => {
		const value = page.url.searchParams.get(PARAMETERS.VIEW);
		// A pasted `?view=grid` link would otherwise render nothing at all on a
		// table that wasn't given a gridLayout snippet.
		if (value === 'grid' && hasGridlayout) return 'grid';
		if (value === 'table') return 'table';
		return DEFAULT_MODE;
	});

	const globalFilter = $derived(page.url.searchParams.get(PARAMETERS.QUERY) ?? '');

	const sorting = $derived.by<SortingState>(() =>
		page.url.searchParams.getAll(PARAMETERS.SORT).flatMap((entry) => {
			// Sort params follow the common `field:direction` convention.
			// Column ids may themselves contain ':', so split on the last one.
			const separatorIndex = entry.lastIndexOf(':');
			if (separatorIndex === -1) return [];

			const field = entry.slice(0, separatorIndex);
			const direction = entry.slice(separatorIndex + 1);

			// Anything the encoder wouldn't have produced is dropped rather than
			// guessed — an unknown column or direction means a stale link.
			if (!validColumnIds.has(field)) return [];
			if (direction !== 'asc' && direction !== 'desc') return [];

			return [{ id: field, desc: direction === 'desc' }];
		})
	);

	const pagination = $derived.by<PaginationState>(() => {
		const pageParameter = Number(page.url.searchParams.get(PARAMETERS.PAGE));
		const sizeParameter = Number(page.url.searchParams.get(PARAMETERS.SIZE));
		return {
			pageIndex:
				Number.isFinite(pageParameter) && pageParameter > 1 ? Math.floor(pageParameter) - 1 : 0,
			pageSize:
				Number.isFinite(sizeParameter) && sizeParameter > 0 ? Math.floor(sizeParameter) : PAGE_SIZE
		};
	});

	// svelte-ignore state_referenced_locally
	const initialColumnVisibility: VisibilityState = Object.fromEntries(
		columnDefinitions
			.filter(
				(columnDefinition) =>
					(columnDefinition.meta as { defaultHidden?: boolean } | undefined)?.defaultHidden === true
			)
			.map(getColumnId)
			.filter((columnId): columnId is string => columnId != null)
			.map((columnId) => [columnId, false])
	);

	const columnVisibility = $derived.by<VisibilityState>(() => {
		if (!page.url.searchParams.has(PARAMETERS.HIDE)) return initialColumnVisibility;
		const hidden = (page.url.searchParams.get(PARAMETERS.HIDE) ?? '')
			.split(',')
			.map((id) => id.trim())
			.filter(Boolean);
		return Object.fromEntries(hidden.map((id) => [id, false]));
	});

	const structuredGlobalFilter = $derived.by<{ query: LiqeQuery | null; error: Error | null }>(
		() => {
			if (!globalFilter) return { query: null, error: null };
			try {
				return { query: parse(globalFilter), error: null };
			} catch (error) {
				return { query: null, error: error as Error };
			}
		}
	);

	// svelte-ignore state_referenced_locally
	let globalFilterTerm = $state(globalFilter);
	let submitGlobalFilterError = $state<Error | null>(null);
	const parseGlobalFilterError = $derived(structuredGlobalFilter.error);

	$effect(() => {
		globalFilterTerm = globalFilter;
		submitGlobalFilterError = null;
	});

	const globalFilterError = $derived(submitGlobalFilterError ?? parseGlobalFilterError);

	let rowSelection = $state<RowSelectionState>({});
	let columnFilters = $state<ColumnFiltersState>([]);
	let columnSizing = $state<ColumnSizingState>({});

	const GLOBAL_FILTER_IDENTIFIER = 'global_filter_identifier';

	// columnDefinitions are set once, capturing the initial value is intentional.
	// svelte-ignore state_referenced_locally
	const columns: ColumnDef<Record<string, JsonValue>>[] = [
		{
			id: 'select',
			header: ({ table }) =>
				renderComponent(Checkbox, {
					class: 'm-1',
					'aria-label': 'Select all',
					checked: table.getIsAllPageRowsSelected(),
					indeterminate: table.getIsSomePageRowsSelected() && !table.getIsAllPageRowsSelected(),
					onCheckedChange: (value) => table.toggleAllPageRowsSelected(!!value)
				}),
			cell: ({ row }) =>
				renderComponent(Checkbox, {
					class: 'm-1',
					'aria-label': 'Select row',
					checked: row.getIsSelected(),
					onCheckedChange: (value) => row.toggleSelected(!!value)
				}),
			enableHiding: false,
			enableSorting: false,
			enableResizing: false,
			size: 30
		},
		...columnDefinitions,
		{
			id: 'actions',
			cell: ({ row }) =>
				renderSnippet(rowActions, {
					row: row
				}),
			header: () =>
				renderSnippet(
					createRawSnippet(() => {
						return {
							render: () => `<span class="sr-only">Actions</span>`
						};
					}),
					{}
				),
			enableHiding: false,
			enableSorting: false,
			enableResizing: false,
			size: 40
		}
	];

	let table = createSvelteTable<Record<string, JsonValue>>({
		columns,
		get data() {
			return data;
		},
		getCoreRowModel: getCoreRowModel(),
		getFacetedUniqueValues: getFacetedUniqueValues(),
		getFilteredRowModel: getFilteredRowModel(),
		getPaginationRowModel: getPaginationRowModel(),
		getSortedRowModel: getSortedRowModel(),
		onColumnFiltersChange: (updater) => {
			if (typeof updater === 'function') {
				columnFilters = updater(columnFilters);
			} else {
				columnFilters = updater;
			}
		},
		onGlobalFilterChange: (updater) => {
			const next = typeof updater === 'function' ? updater(globalFilter) : updater;
			const query = (next ?? '') as string;
			commit(
				(params) => {
					if (query) {
						params.set(PARAMETERS.QUERY, query);
					} else {
						params.delete(PARAMETERS.QUERY);
					}
					// A new query invalidates the current page.
					params.delete(PARAMETERS.PAGE);
				},
				// Searching is an explicit, deliberate action, so it earns a
				// history entry: back returns to the previous query.
				{ history: 'push' }
			);
		},
		onColumnVisibilityChange: (updater) => {
			const next = typeof updater === 'function' ? updater(columnVisibility) : updater;
			const hidden = Object.entries(next)
				.filter(([, visible]) => visible === false)
				.map(([id]) => id);
			commit((params) => params.set(PARAMETERS.HIDE, hidden.join(',')));
		},
		onColumnSizingChange: (updater) => {
			if (typeof updater === 'function') {
				columnSizing = updater(columnSizing);
			} else {
				columnSizing = updater;
			}
		},
		onPaginationChange: (updater) => {
			const next = typeof updater === 'function' ? updater(pagination) : updater;
			commit((params) => {
				if (next.pageIndex > 0) {
					params.set(PARAMETERS.PAGE, String(next.pageIndex + 1));
				} else {
					params.delete(PARAMETERS.PAGE);
				}
				if (next.pageSize !== PAGE_SIZE) {
					params.set(PARAMETERS.SIZE, String(next.pageSize));
				} else {
					params.delete(PARAMETERS.SIZE);
				}
			});
		},
		onRowSelectionChange: (updater) => {
			if (typeof updater === 'function') {
				rowSelection = updater(rowSelection);
			} else {
				rowSelection = updater;
			}
		},
		onSortingChange: (updater) => {
			const next = typeof updater === 'function' ? updater(sorting) : updater;
			commit((params) => {
				params.delete(PARAMETERS.SORT);
				for (const entry of next) {
					params.append(PARAMETERS.SORT, `${entry.id}:${entry.desc ? 'desc' : 'asc'}`);
				}
				// Re-sorting invalidates the current page.
				params.delete(PARAMETERS.PAGE);
			});
		},
		state: {
			get globalFilter() {
				return globalFilter;
			},
			get columnFilters() {
				return columnFilters;
			},
			get columnVisibility() {
				return columnVisibility;
			},
			get columnSizing() {
				return columnSizing;
			},
			get pagination() {
				return pagination;
			},
			get rowSelection() {
				return rowSelection;
			},
			get sorting() {
				return sorting;
			}
		},
		globalFilterFn: (row) => {
			if (!globalFilter) return true;
			if (!structuredGlobalFilter.query) return false;
			try {
				return test(structuredGlobalFilter.query, row.original);
			} catch {
				return false;
			}
		},
		columnResizeMode: 'onChange',
		autoResetPageIndex: false
	});

	function getColumnId(columnDefinition: ColumnDef<Record<string, JsonValue>>): string | undefined {
		return columnDefinition.id ?? (columnDefinition as { accessorKey?: string }).accessorKey;
	}

	// svelte-ignore state_referenced_locally
	const validColumnIds = new Set(
		columnDefinitions.map(getColumnId).filter((id): id is string => id != null)
	);

	function commit(
		patch: (urlSearchParameters: URLSearchParams) => void,
		{ history = 'replace' }: { history?: 'replace' | 'push' } = {}
	) {
		const url = new URL(page.url);
		patch(url.searchParams);
		// A patch can be a no-op (re-selecting the current page size, toggling a
		// column that is already hidden). Navigating anyway would stack identical
		// history entries and make the back button feel broken.
		if (url.href === page.url.href) return;
		// The URL is cloned from page.url, so the base path is already applied —
		// resolve() would double it, and its type doesn't accept query strings.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		void goto(url, {
			replaceState: history === 'replace',
			keepFocus: true,
			noScroll: true,
			// Filtering is client-side; the data prop must survive the navigation.
			invalidateAll: false
		});
	}

	function setMode(next: 'table' | 'grid') {
		commit((params) => {
			if (next === DEFAULT_MODE) {
				params.delete(PARAMETERS.VIEW);
			} else {
				params.set(PARAMETERS.VIEW, next);
			}
		});
	}

	function handleKeyDown(event: KeyboardEvent) {
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
			event.preventDefault();
			handleSearch();
		}

		if (event.key === 'Escape') {
			event.preventDefault();
			handleClear();
		}
	}

	function handleSearch() {
		try {
			if (globalFilterTerm) {
				parse(globalFilterTerm);
			}
			submitGlobalFilterError = null;
			table.setGlobalFilter(globalFilterTerm);
		} catch (error) {
			submitGlobalFilterError = error as Error;
		}
	}

	function handleClear() {
		globalFilterTerm = '';
		submitGlobalFilterError = null;
		table.setGlobalFilter('');
	}

	function getAlignment(uiSchema: UISchemaType): 'start' | 'center' | 'end' {
		const map: Record<NonNullable<UISchemaType>, 'start' | 'center' | 'end'> = {
			boolean: 'center',
			number: 'end',
			time: 'end',
			text: 'start',
			item: 'start',
			array: 'center',
			'array-of-object': 'center',
			object: 'center',
			link: 'start',
			ratio: 'end',
			quantity: 'end',
			'array-of-enumeration': 'center',
			'object-of-key-value': 'center'
		};
		return uiSchema ? map[uiSchema] : 'start';
	}
	function getHeaderAlignment(uiSchema: UISchemaType): string {
		const alignment = getAlignment(uiSchema);
		switch (alignment) {
			case 'start':
				return 'justify-start';
			case 'center':
				return 'justify-center';
			case 'end':
			default:
				return 'justify-end';
		}
	}
	function getCellAlignment(uiSchema: UISchemaType): string {
		const alignment = getAlignment(uiSchema);
		switch (alignment) {
			case 'start':
				return 'text-start';
			case 'center':
				return 'text-center';
			case 'end':
			default:
				return 'text-end';
		}
	}

	function isTerminating(row: Row<Record<string, JsonValue>>): boolean {
		return lodash.get(row.original, 'raw.metadata.deletionTimestamp') != null;
	}
</script>

<svelte:window
	use:shortcut={{
		key: '/',
		ctrl: true,
		callback: () => {
			const input = document.getElementById(GLOBAL_FILTER_IDENTIFIER);
			if (input) (input as HTMLInputElement).focus();
		}
	}}
/>

<div class="space-y-4">
	<!-- Controllers -->
	<div class="flex w-full items-center gap-2">
		<!-- Filters -->
		<ButtonGroup.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							variant={mode === 'table' ? 'secondary' : 'outline'}
							size="icon"
							onclick={() => setMode('table')}
							aria-pressed={mode === 'table'}
						>
							<SheetIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Table View</Tooltip.Content>
			</Tooltip.Root>
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							disabled={!gridLayout}
							variant={mode === 'grid' ? 'secondary' : 'outline'}
							size="icon"
							onclick={() => setMode('grid')}
							aria-pressed={mode === 'grid'}
						>
							<LayoutGridIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Grid View</Tooltip.Content>
			</Tooltip.Root>
		</ButtonGroup.Root>
		<Tooltip.Root>
			<DropdownMenu.Root>
				<Tooltip.Trigger>
					<DropdownMenu.Trigger disabled={mode === 'grid'}>
						{#snippet child({ props })}
							<Button variant="outline" size="icon" {...props}>
								<Columns3Icon size={16} aria-hidden="true" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
				</Tooltip.Trigger>
				<DropdownMenu.Content align="start">
					<DropdownMenu.Label>Toggle columns</DropdownMenu.Label>
					{#each table
						.getAllColumns()
						.filter((column) => column.getCanHide()) as column (column.id)}
						<DropdownMenu.Item
							class={column.getIsVisible()
								? 'text-primary **:text-primary'
								: 'text-muted-foreground/50 **:text-muted-foreground/50'}
							closeOnSelect={false}
							onSelect={() => column.toggleVisibility(!column.getIsVisible())}
						>
							<CheckIcon class={column.getIsVisible() ? 'visible' : 'invisible'} />
							{column.id}
						</DropdownMenu.Item>
					{/each}
				</DropdownMenu.Content>
			</DropdownMenu.Root>
			<Tooltip.Content>Toggle Columns</Tooltip.Content>
		</Tooltip.Root>
		<ButtonGroup.Root class="w-full">
			<InputGroup.Root>
				<InputGroup.Addon>
					<CodeIcon size={16} />
				</InputGroup.Addon>
				<InputGroup.Input
					id={GLOBAL_FILTER_IDENTIFIER}
					placeholder="e.g. Name:resourceName AND Namespace:namespace"
					bind:value={globalFilterTerm}
					class="peer w-full"
					onkeydown={handleKeyDown}
				/>
				<InputGroup.Addon align="inline-end" class="hidden peer-focus:flex">
					<Kbd.Group>
						<Kbd.Root>⏎</Kbd.Root>
						<Kbd.Root class="bg-destructive/10 text-destructive">esc</Kbd.Root>
					</Kbd.Group>
				</InputGroup.Addon>
				<InputGroup.Addon align="inline-end" class="peer-focus:hidden">
					<Kbd.Group>
						<Kbd.Root>ctrl</Kbd.Root>
						<Kbd.Root>/</Kbd.Root>
					</Kbd.Group>
				</InputGroup.Addon>
			</InputGroup.Root>
			<DynamicTableSearchDocument />
		</ButtonGroup.Root>
		<!-- Accessors -->
		<div class="ml-auto flex items-center gap-2">
			{@render accessReview?.()}
			{@render create?.()}
			{@render bulkCreate?.({ table })}
			{@render bulkDelete?.({ table })}
			{@render reload?.()}
		</div>
	</div>
	{#if globalFilterError}
		<p class="text-xs text-destructive">
			{globalFilterError.message}
		</p>
	{/if}

	<!-- Layouts -->
	{#if mode === 'table'}
		{@render tableLayout()}
	{:else if mode === 'grid'}
		{@render gridLayout?.({ table, handleClear })}
	{/if}

	<!-- Pagination -->
	<div class="flex items-center justify-between gap-8">
		<!-- Results -->
		<div class="flex items-center gap-3">
			<Label class="max-sm:sr-only">Rows per page</Label>
			<Select
				type="single"
				value={table.getState().pagination.pageSize.toString()}
				onValueChange={(value) => {
					table.setPageSize(Number(value));
				}}
			>
				<SelectTrigger class="w-fit whitespace-nowrap">
					{table.getState().pagination.pageSize.toString() ?? 'Select number of results'}
				</SelectTrigger>
				<SelectContent
					class="[&_*[role=option]]:ps-2 [&_*[role=option]]:pe-8 [&_*[role=option]>span]:inset-s-auto [&_*[role=option]>span]:inset-e-2"
				>
					{#each PAGE_SIZES as pageSize (pageSize)}
						<SelectItem value={pageSize.toString()}>
							{pageSize}
						</SelectItem>
					{/each}
				</SelectContent>
			</Select>
		</div>

		<!-- Page -->
		<div class="flex grow justify-end text-sm whitespace-nowrap text-muted-foreground">
			<p class="text-sm whitespace-nowrap text-muted-foreground" aria-live="polite">
				<span class="text-foreground">
					{table.getState().pagination.pageIndex * table.getState().pagination.pageSize +
						1}-{Math.min(
						Math.max(
							table.getState().pagination.pageIndex * table.getState().pagination.pageSize +
								table.getState().pagination.pageSize,
							0
						),
						table.getRowCount()
					)}
				</span>
				of
				<span class="text-foreground">
					{table.getRowCount().toString()}
				</span>
			</p>
		</div>

		<!-- Controller -->
		<div>
			<Pagination.Root count={table.getRowCount()}>
				<Pagination.Content>
					<!-- First page button -->
					<Pagination.Item>
						<Button
							size="icon"
							variant="outline"
							class="disabled:pointer-events-none disabled:opacity-50"
							onclick={() => table.firstPage()}
							disabled={!table.getCanPreviousPage()}
							aria-label="Go to first page"
						>
							<ChevronFirstIcon size={16} aria-hidden="true" />
						</Button>
					</Pagination.Item>
					<!-- Previous page button -->
					<Pagination.Item>
						<Button
							size="icon"
							variant="outline"
							class="disabled:pointer-events-none disabled:opacity-50"
							onclick={() => table.previousPage()}
							disabled={!table.getCanPreviousPage()}
							aria-label="Go to previous page"
						>
							<ChevronLeftIcon size={16} aria-hidden="true" />
						</Button>
					</Pagination.Item>
					<!-- Next page button -->
					<Pagination.Item>
						<Button
							size="icon"
							variant="outline"
							class="disabled:pointer-events-none disabled:opacity-50"
							onclick={() => table.nextPage()}
							disabled={!table.getCanNextPage()}
							aria-label="Go to next page"
						>
							<ChevronRightIcon size={16} aria-hidden="true" />
						</Button>
					</Pagination.Item>
					<!-- Last page button -->
					<Pagination.Item>
						<Button
							size="icon"
							variant="outline"
							class="disabled:pointer-events-none disabled:opacity-50"
							onclick={() => table.lastPage()}
							disabled={!table.getCanNextPage()}
							aria-label="Go to last page"
						>
							<ChevronLastIcon size={16} aria-hidden="true" />
						</Button>
					</Pagination.Item>
				</Pagination.Content>
			</Pagination.Root>
		</div>
	</div>
</div>

{#snippet tableLayout()}
	<div class="overflow-hidden rounded-md border bg-background">
		<Table.Root class="table-fixed">
			<Table.Header class="bg-muted">
				{#each table.getHeaderGroups() as headerGroup (headerGroup.id)}
					{@const totalSize = headerGroup.headers.reduce(
						(accumulation, head) => accumulation + head.getSize(),
						0
					)}
					<Table.Row class="hover:bg-transparent">
						{#each headerGroup.headers as header (header.id)}
							<Table.Head
								style={`width: ${(header.getSize() / totalSize) * 100}%`}
								class={cn(
									lodash.get(header.column.columnDef.meta, 'class'),
									'relative h-11 border-t select-none [&:last-child>.cursor-col-resize]:opacity-0'
								)}
							>
								{#if !header.isPlaceholder && header.column.getCanSort()}
									<div
										class={cn(
											header.column.getCanSort() &&
												'flex h-full cursor-pointer items-center justify-between gap-2 select-none',
											getHeaderAlignment(uiSchemas[header.column.id])
										)}
										onclick={header.column.getToggleSortingHandler()}
										onkeydown={(e) => {
											if (header.column.getCanSort() && (e.key === 'Enter' || e.key === ' ')) {
												e.preventDefault();
												header.column.getToggleSortingHandler()?.(e);
											}
										}}
										{...header.column.getCanSort()
											? {
													tabindex: 0,
													role: 'button',
													'aria-pressed': header.column.getIsSorted() ? 'true' : 'false'
												}
											: {}}
									>
										<FlexRender
											content={header.column.columnDef.header}
											context={header.getContext()}
										/>
										{#if header.column.getIsSorted() === 'asc'}
											<ChevronUpIcon class="shrink-0 opacity-60" size={16} aria-hidden="true" />
										{:else if header.column.getIsSorted() === 'desc'}
											<ChevronDownIcon class="shrink-0 opacity-60" size={16} aria-hidden="true" />
										{/if}
									</div>
								{:else if !header.isPlaceholder && !header.column.getCanSort()}
									<FlexRender
										content={header.column.columnDef.header}
										context={header.getContext()}
									/>
								{/if}
								{#if header.column.getCanResize()}
									<div
										aria-hidden="true"
										class="user-select-none absolute top-0 -right-2 z-10 flex h-full w-4 cursor-col-resize touch-none justify-center"
										ondblclick={() => header.column.resetSize()}
										onmousedown={header.getResizeHandler()}
										ontouchstart={header.getResizeHandler()}
									></div>
								{/if}
							</Table.Head>
						{/each}
					</Table.Row>
				{/each}
			</Table.Header>
			<Table.Body>
				{#if table.getRowModel().rows?.length}
					{#each table.getRowModel().rows as row (row.id)}
						<Table.Row
							data-state={row.getIsSelected() && 'selected'}
							class={cn(isTerminating(row) && 'opacity-50 grayscale')}
						>
							{#each row.getVisibleCells() as cell (cell.id)}
								<Table.Cell
									class={cn(
										getCellAlignment(uiSchemas[cell.column.id]),
										lodash.get(cell.column.columnDef.meta, 'class')
									)}
								>
									<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
								</Table.Cell>
							{/each}
						</Table.Row>
					{/each}
				{:else}
					<Table.Row>
						<Table.Cell colspan={columns.length} class="h-full text-center">
							<Empty.Root>
								<Empty.Header>
									<Empty.Media variant="icon">
										<Columns3Icon size={32} class="opacity-60" aria-hidden="true" />
									</Empty.Media>
									<Empty.Title>No Resources Found</Empty.Title>
									<Empty.Description>
										No resources found. Please adjust your filters or initiate a new resource to
										populate this table.
									</Empty.Description>
								</Empty.Header>
								<Empty.Content>
									<Button onclick={handleClear}>
										<EraserIcon size={16} class="opacity-60" />
										Reset
									</Button>
								</Empty.Content>
							</Empty.Root>
						</Table.Cell>
					</Table.Row>
				{/if}
			</Table.Body>
		</Table.Root>
	</div>
{/snippet}

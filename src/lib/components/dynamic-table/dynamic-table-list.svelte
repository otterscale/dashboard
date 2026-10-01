<script lang="ts" module>
	import type { StatusTone } from './status';

	const GROUP_DOT_CLASSES = {
		failed: 'bg-destructive',
		degraded: 'bg-warning',
		progressing: 'bg-warning',
		unknown: 'bg-muted-foreground/30',
		stopped: 'bg-muted-foreground/50',
		healthy: 'bg-success'
	} as const satisfies Record<StatusTone, string>;

	// Columns that list rows place themselves; everything else visible becomes muted detail.
	const PLACED_COLUMN_IDS = new Set(['select', 'actions', 'Name']);
	// Status columns in the order they should speak for a row when tied.
	const STATUS_PREFERENCE = ['Status', 'State', 'Phase', 'Ready'];
	// Enough detail to tell rows apart at a glance; the table view has the rest.
	const MAX_DETAIL_CELLS = 2;
</script>

<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { Cell, Row, Table as TanStackTable } from '@tanstack/table-core';
	import lodash from 'lodash';
	import type { Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { slide } from 'svelte/transition';

	import { FlexRender } from '$lib/components/ui/data-table';
	import { m } from '$lib/messages';
	import { viewMode } from '$lib/stores';
	import { cn } from '$lib/utils';

	import { getColumnLabel } from './column-labels';
	import { readStatus, STATUS_TONES, worstStatus } from './status';
	import type { UISchemaType } from './utils';

	type Data = Record<string, JsonValue>;

	let {
		table,
		uiSchemas,
		empty
	}: {
		table: TanStackTable<Data>;
		uiSchemas: Record<string, UISchemaType>;
		empty: Snippet;
	} = $props();

	const GROUP_LABELS = {
		failed: m.list_group_failed,
		degraded: m.list_group_degraded,
		progressing: m.list_group_progressing,
		unknown: m.list_group_unknown,
		stopped: m.list_group_stopped,
		healthy: m.list_group_healthy
	} as const satisfies Record<StatusTone, () => string>;

	type ListRow = {
		row: Row<Data>;
		name?: Cell<Data, unknown>;
		status?: Cell<Data, unknown>;
		time?: Cell<Data, unknown>;
		details: Cell<Data, unknown>[];
		actions?: Cell<Data, unknown>;
		tone?: StatusTone;
	};

	function toListRow(row: Row<Data>): ListRow {
		const cells = row.getVisibleCells();
		const byId = (id: string) => cells.find((cell) => cell.column.id === id);

		const statusCells = cells
			.filter((cell) => uiSchemas[cell.column.id] === 'status')
			.sort(
				(a, b) =>
					(STATUS_PREFERENCE.indexOf(a.column.id) + 1 || Infinity) -
					(STATUS_PREFERENCE.indexOf(b.column.id) + 1 || Infinity)
			);
		const status = worstStatus(
			statusCells.map((cell) => ({ cell, tone: readStatus(row.original[cell.column.id]).tone }))
		);
		const time = cells.find((cell) => uiSchemas[cell.column.id] === 'time');

		return {
			row,
			name: byId('Name'),
			status: status?.cell,
			tone: status?.tone,
			time,
			details: cells
				.filter(
					(cell) =>
						!PLACED_COLUMN_IDS.has(cell.column.id) &&
						cell !== time &&
						uiSchemas[cell.column.id] !== 'status'
				)
				.slice(0, MAX_DETAIL_CELLS),
			actions: byId('actions')
		};
	}

	// Every row that passes the search, not just one page of them:
	// grouping by status only helps if a problem on page two cannot hide.
	const listRows = $derived(table.getPrePaginationRowModel().rows.map(toListRow));
	const hasStatus = $derived(listRows.some((listRow) => listRow.tone));
	const groups = $derived(
		hasStatus
			? STATUS_TONES.map((tone) => ({
					tone,
					rows: listRows.filter((listRow) => (listRow.tone ?? 'unknown') === tone)
				})).filter((group) => group.rows.length > 0)
			: [{ tone: undefined, rows: listRows }]
	);

	let collapsed = $state<Partial<Record<StatusTone, boolean>>>({});

	function isTerminating(row: Row<Data>): boolean {
		return lodash.get(row.original, 'raw.metadata.deletionTimestamp') != null;
	}
</script>

{#if listRows.length === 0}
	<div class="rounded-lg border bg-background">
		{@render empty()}
	</div>
{:else}
	<div class="overflow-hidden rounded-lg border bg-background">
		{#each groups as group (group.tone ?? 'all')}
			{@const open = !group.tone || !collapsed[group.tone]}
			{#if group.tone}
				{@const tone = group.tone}
				<button
					type="button"
					class="flex h-9 w-full items-center gap-2 border-b bg-muted/40 px-4 text-xs font-medium text-muted-foreground transition-colors outline-none hover:bg-muted/70 focus-visible:bg-muted/70"
					aria-expanded={open}
					aria-label={m.list_group_toggle({ group: GROUP_LABELS[tone]() })}
					onclick={() => (collapsed[tone] = open)}
				>
					<ChevronRightIcon
						class={cn(
							'size-3.5 transition-transform duration-(--duration-base) ease-(--ease-smooth)',
							open && 'rotate-90'
						)}
						aria-hidden="true"
					/>
					<span class={cn('size-1.5 rounded-full', GROUP_DOT_CLASSES[tone])} aria-hidden="true"
					></span>
					<span class="text-foreground">{GROUP_LABELS[tone]()}</span>
					<span class="tabular-nums">{group.rows.length}</span>
				</button>
			{/if}
			{#if open}
				<ul transition:slide={{ duration: 220, easing: cubicOut }}>
					{#each group.rows as listRow (listRow.row.id)}
						<li
							class={cn(
								'group/row flex min-h-11 items-center gap-4 border-b px-4 py-2 text-sm transition-colors last:border-b-0 hover:bg-muted/40',
								isTerminating(listRow.row) && 'opacity-50 grayscale'
							)}
						>
							<div class="min-w-0 flex-1 font-medium">
								{#if listRow.name}
									<FlexRender
										content={listRow.name.column.columnDef.cell}
										context={listRow.name.getContext()}
									/>
								{/if}
							</div>
							<!-- Labelled: unlike a table, a list has no header to say what a bare "2" is. -->
							{#each listRow.details as cell (cell.id)}
								<div
									class="hidden w-32 min-w-0 shrink-0 items-center justify-end gap-1.5 text-xs tabular-nums lg:flex"
								>
									<span class="shrink-0 text-muted-foreground"
										>{$viewMode === 'simple'
											? getColumnLabel(cell.column.id)
											: cell.column.id}</span
									>
									<span class="min-w-0 truncate">
										<FlexRender content={cell.column.columnDef.cell} context={cell.getContext()} />
									</span>
								</div>
							{/each}
							{#if listRow.status}
								<div class="w-32 min-w-0 shrink-0">
									<FlexRender
										content={listRow.status.column.columnDef.cell}
										context={listRow.status.getContext()}
									/>
								</div>
							{/if}
							{#if listRow.time}
								<div class="hidden w-24 shrink-0 text-end text-xs text-muted-foreground sm:block">
									<FlexRender
										content={listRow.time.column.columnDef.cell}
										context={listRow.time.getContext()}
									/>
								</div>
							{/if}
							{#if listRow.actions}
								<div class="shrink-0">
									<FlexRender
										content={listRow.actions.column.columnDef.cell}
										context={listRow.actions.getContext()}
									/>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		{/each}
	</div>
{/if}

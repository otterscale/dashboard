<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import Columns3Icon from '@lucide/svelte/icons/columns-3';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import type { ColumnDef } from '@tanstack/table-core';

	import { DynamicTable, SearchParametersTableState } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';
	import * as Tooltip from '$lib/components/ui/tooltip';

	import Actions from './chart-viewer-actions/actions.svelte';
	import Upload from './chart-viewer-actions/upload.svelte';
	import Grid from './grid-layout.svelte';
	import {
		type ChartAttribute,
		getChartColumnDefinitions,
		getChartDataSchemas,
		getChartUISchemas
	} from './table-layout.ts';
	import type { ChartVariant } from './variants';

	let {
		chartVariant,
		cluster,
		namespace,
		charts,
		isFetching,
		onReload
	}: {
		chartVariant: ChartVariant;
		cluster: string;
		namespace: string;
		charts: Record<ChartAttribute, JsonValue>[];
		isFetching: boolean;
		onReload: () => void;
	} = $props();

	const uiSchemas: Record<string, UISchemaType> = getChartUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getChartDataSchemas();
	const columnDefinitions: ColumnDef<Record<ChartAttribute, JsonValue>>[] =
		getChartColumnDefinitions(uiSchemas, dataSchemas);
	// This table is the subject of its page, so its view belongs in the URL.
	const tableState = new SearchParametersTableState();
</script>

<div class="space-y-4">
	<div class="flex items-end justify-between gap-4">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">{chartVariant.title}</Item.Title>
				<Item.Description class="text-base">{cluster}/{namespace}</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
	<DynamicTable data={charts} {columnDefinitions} {uiSchemas} {tableState}>
		{#snippet reload()}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<Button
							{...props}
							onclick={onReload}
							disabled={isFetching}
							variant="outline"
							size="icon"
						>
							<RefreshCwIcon />
						</Button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content>Reload</Tooltip.Content>
			</Tooltip.Root>
		{/snippet}
		{#snippet gridLayout({ table, handleClear })}
			{#if table.getRowModel().rows?.length}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each table.getRowModel().rows as row (row.id)}
						<Grid {row} {chartVariant} {cluster} {namespace} />
					{/each}
				</div>
			{:else}
				<Empty.Root class="rounded-lg bg-muted">
					<Empty.Header>
						<Empty.Media variant="icon">
							<Columns3Icon size={32} class="opacity-60" aria-hidden="true" />
						</Empty.Media>
						<Empty.Title>No Resources Found</Empty.Title>
						<Empty.Description>
							No resources found. Please adjust your filters or initiate a new resource to populate
							this table.
						</Empty.Description>
					</Empty.Header>
					<Empty.Content>
						<Button onclick={handleClear}>
							<EraserIcon size={16} class="opacity-60" />
							Reset
						</Button>
					</Empty.Content>
				</Empty.Root>
			{/if}
		{/snippet}
		{#snippet create()}
			<Upload {chartVariant} {namespace} />
		{/snippet}
		{#snippet rowActions({ row })}
			<Actions {row} {chartVariant} {cluster} {namespace} />
		{/snippet}
	</DynamicTable>
</div>

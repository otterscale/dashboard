<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import Columns3Icon from '@lucide/svelte/icons/columns-3';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import type { ColumnDef } from '@tanstack/table-core';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';

	import Actions from './artifact-viewer-actions/actions.svelte';
	import Upload from './artifact-viewer-actions/upload.svelte';
	import Grid from './grid-layout.svelte';
	import {
		type ChartAttribute,
		getChartColumnDefinitions,
		getChartDataSchemas,
		getChartUISchemas
	} from './table-layout.ts';

	let {
		cluster,
		namespace,
		charts,
		reload
	}: { cluster: string; namespace: string; charts: any[]; reload: any } = $props();

	const uiSchemas: Record<string, UISchemaType> = getChartUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getChartDataSchemas();
	const columnDefinitions: ColumnDef<Record<ChartAttribute, JsonValue>>[] =
		getChartColumnDefinitions(uiSchemas, dataSchemas);
</script>

<div class="space-y-4">
	<div class="flex items-end justify-between gap-4">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Hub</Item.Title>
				<Item.Description class="text-base">{cluster}/{namespace}</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
	<DynamicTable dataset={charts} {columnDefinitions} {uiSchemas} {reload}>
		{#snippet gridsLayout({ table, handleClear })}
			{#if table.getRowModel().rows?.length}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each table.getRowModel().rows as row (row.id)}
						<Grid {row} {cluster} {namespace} />
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
			<Upload {namespace} />
		{/snippet}
		{#snippet rowActions({ row })}
			<Actions {row} {cluster} {namespace} />
		{/snippet}
	</DynamicTable>
</div>

<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import Columns3Icon from '@lucide/svelte/icons/columns-3';
	import EraserIcon from '@lucide/svelte/icons/eraser';
	import { ResourceService, type SchemaRequest } from '@otterscale/api/resource/v1';
	import type { Schema } from '@sjsf/form';
	import type { ColumnDef } from '@tanstack/table-core';
	import Ajv, { type ValidateFunction } from 'ajv';
	import type { Snippet } from 'svelte';
	import { getContext, onMount } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { DynamicTable } from '$lib/components/dynamic-table';
	import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Empty from '$lib/components/ui/empty/index.js';
	import * as Item from '$lib/components/ui/item';

	import BulkInstall from './bulk-install.svelte';
	import BulkUpgrade from './bulk-upgrade.svelte';
	import Grid from './grid-layout.svelte';
	import Actions from './module-viewer-actions/actions.svelte';
	import {
		getChartColumnDefinitions,
		getChartDataSchemas,
		getChartUISchemas,
		type ModuleAttribute
	} from './table-layout.ts';

	const helmReleaseGroup = 'helm.toolkit.fluxcd.io';
	const helmReleaseVersion = 'v2';
	const helmReleaseKind = 'HelmRelease';

	let {
		cluster,
		namespace,
		data,
		reload
	}: {
		cluster: string;
		namespace: string;
		data: Record<ModuleAttribute, JsonValue>[];
		reload: Snippet<[]>;
	} = $props();

	const uiSchemas: Record<string, UISchemaType> = getChartUISchemas();
	const dataSchemas: Record<string, DataSchemaType> = getChartDataSchemas();
	const columnDefinitions: ColumnDef<Record<ModuleAttribute, JsonValue>>[] =
		getChartColumnDefinitions(uiSchemas, dataSchemas);

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let schema: Schema | undefined = $state(undefined);
	let validate: ValidateFunction | undefined = $state(undefined);

	const jsonSchemaValidator = new Ajv({ allErrors: true, strict: false, logger: false });
	function getValidate(jsonSchema: Schema) {
		return jsonSchemaValidator.compile($state.snapshot(jsonSchema));
	}

	async function fetchSchema() {
		try {
			const schemaResponse = await resourceClient.schema({
				cluster,
				group: helmReleaseGroup,
				version: helmReleaseVersion,
				kind: helmReleaseKind
			} as SchemaRequest);

			return schemaResponse.schema as Schema;
		} catch (error) {
			console.error('Failed to fetch HelmRelease schema:', error);
			toast.error('Failed to fetch HelmRelease schema');
			return undefined;
		}
	}

	onMount(async () => {
		schema = await fetchSchema();
		if (schema) {
			validate = getValidate(schema);
		}
	});
</script>

<div class="space-y-4">
	<div class="flex items-end justify-between gap-4">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">Module</Item.Title>
				<Item.Description class="text-base">{cluster}/{namespace}</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
	<DynamicTable {data} {columnDefinitions} {uiSchemas} {reload}>
		{#snippet gridLayout({ table, handleClear })}
			{#if table.getRowModel().rows?.length}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
					{#each table.getRowModel().rows as row (row.id)}
						<Grid {row} {cluster} {schema} {validate} />
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
		{#snippet bulkCreate({ table })}
			<BulkInstall {table} {cluster} />
			<BulkUpgrade {table} {cluster} {schema} {validate} />
		{/snippet}
		{#snippet rowActions({ row })}
			<Actions {row} {cluster} {schema} {validate} />
		{/snippet}
	</DynamicTable>
</div>

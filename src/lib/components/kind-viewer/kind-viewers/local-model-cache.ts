import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type {
	ArrayOfObjectItemType,
	ArrayOfObjectMetadata
} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type LocalModelCacheObject = {
	metadata?: {
		name?: string;
		creationTimestamp?: string;
	};
	spec?: {
		modelSize?: string | number;
		nodeGroups?: string[];
		serviceAccountName?: string;
		sourceModelUri?: string;
	};
	status?: {
		copies?: {
			available?: number;
			failed?: number;
			total?: number;
		};
		inferenceServices?: { name?: string; namespace?: string }[];
		nodeStatus?: Record<string, string>;
	};
};

type LocalModelCacheAttribute =
	| 'Name'
	| 'Source Model URI'
	| 'Model Size'
	| 'Node Groups'
	| 'Service Account'
	| 'Copies'
	| 'Inference Services'
	| 'Age'
	| 'raw';

function getLocalModelCacheDataSchemas(): Record<LocalModelCacheAttribute, DataSchemaType> {
	return {
		Name: 'text',
		'Source Model URI': 'text',
		'Model Size': 'text',
		'Node Groups': 'text',
		'Service Account': 'text',
		Copies: 'text',
		'Inference Services': 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getLocalModelCacheData(
	object: LocalModelCacheObject
): Record<LocalModelCacheAttribute, JsonValue> {
	const copies = object?.status?.copies;
	return {
		Name: object?.metadata?.name ?? null,
		'Source Model URI': object?.spec?.sourceModelUri ?? null,
		'Model Size': (object?.spec?.modelSize as JsonValue) ?? null,
		'Node Groups': (object?.spec?.nodeGroups ?? []).join(', '),
		'Service Account': object?.spec?.serviceAccountName ?? null,
		Copies: `${copies?.available ?? '-'} / ${copies?.total ?? '-'}`,
		'Inference Services': (object?.status?.inferenceServices ?? []).length,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getLocalModelCacheUISchemas(): Record<LocalModelCacheAttribute, UISchemaType> {
	return {
		Name: 'link',
		'Source Model URI': 'text',
		'Model Size': 'text',
		'Node Groups': 'text',
		'Service Account': 'text',
		Copies: 'text',
		'Inference Services': 'array-of-object',
		Age: 'time',
		raw: 'object'
	};
}

function getLocalModelCacheColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<LocalModelCacheAttribute, UISchemaType>,
	dataSchemas: Record<LocalModelCacheAttribute, DataSchemaType>
): ColumnDef<Record<LocalModelCacheAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as LocalModelCacheAttribute] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Source Model URI',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Source Model URI'
		},
		{
			id: 'Model Size',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Model Size'
		},
		{
			id: 'Node Groups',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Node Groups'
		},
		{
			id: 'Service Account',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Service Account'
		},
		{
			id: 'Copies',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Copies'
		},
		{
			id: 'Inference Services',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (
							(row.original.raw as LocalModelCacheObject)?.status?.inferenceServices ?? []
						).map(
							(service) =>
								({
									title: service?.name,
									description: service?.namespace
								}) as ArrayOfObjectItemType
						)
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Inference Services'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<LocalModelCacheAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelCacheAttribute, JsonValue>>;
				row: Row<Record<LocalModelCacheAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Age'
		}
	];
}

export {
	getLocalModelCacheColumnDefinitions,
	getLocalModelCacheData,
	getLocalModelCacheDataSchemas,
	getLocalModelCacheUISchemas
};

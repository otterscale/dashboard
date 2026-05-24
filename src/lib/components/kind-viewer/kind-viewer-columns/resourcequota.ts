import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1ResourceQuota } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type RatioMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/ratio-cell.svelte';
import {
	type DataSchemaType,
	getRatio,
	type UISchemaType
} from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from '../utils';

type ResourceQuotaAttribute =
	| 'Name'
	| 'Namespace'
	| 'CPU Request'
	| 'Memory Request'
	| 'CPU Limit'
	| 'Memory Limit'
	| 'GPU Memory Limit'
	| 'raw';

function getResourceQuotaDataSchemas(): Record<ResourceQuotaAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'CPU Request': 'number',
		'Memory Request': 'number',
		'CPU Limit': 'number',
		'Memory Limit': 'number',
		'GPU Memory Limit': 'number',
		raw: 'object'
	};
}

function getResourceQuotaData(
	object: CoreV1ResourceQuota
): Record<ResourceQuotaAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'CPU Request': getRatio(
			object?.status?.used?.['requests.cpu'] ?? null,
			object?.status?.hard?.['requests.cpu'] ?? null,
			'continuous'
		),
		'Memory Request': getRatio(
			object?.status?.used?.['requests.memory'] ?? null,
			object?.status?.hard?.['requests.memory'] ?? null,
			'discrete'
		),
		'CPU Limit': getRatio(
			object?.status?.used?.['limits.cpu'] ?? null,
			object?.status?.hard?.['limits.cpu'] ?? null,
			'continuous'
		),
		'Memory Limit': getRatio(
			object?.status?.used?.['limits.memory'] ?? null,
			object?.status?.hard?.['limits.memory'] ?? null,
			'discrete'
		),
		'GPU Memory Limit': getRatio(
			object?.status?.used?.['limits.nvidia.com/gpumem'] ?? null,
			object?.status?.hard?.['limits.nvidia.com/gpumem'] ?? null,
			'discrete'
		),
		raw: object as JsonObject
	};
}

function getResourceQuotaUISchemas(): Record<ResourceQuotaAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'CPU Request': 'ratio',
		'Memory Request': 'ratio',
		'CPU Limit': 'ratio',
		'Memory Limit': 'ratio',
		'GPU Memory Limit': 'ratio',
		raw: 'object'
	};
}

function getResourceQuotaColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ResourceQuotaAttribute, UISchemaType>,
	dataSchemas: Record<ResourceQuotaAttribute, DataSchemaType>
): ColumnDef<Record<ResourceQuotaAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ResourceQuotaAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ResourceQuotaAttribute, JsonValue>>;
				row: Row<Record<ResourceQuotaAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ResourceQuotaAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ResourceQuotaAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ResourceQuotaAttribute, JsonValue>>;
				row: Row<Record<ResourceQuotaAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace',
			meta: { defaultHidden: true }
		},
		{
			id: 'CPU Request',
			header: ({ column }: { column: Column<Record<ResourceQuotaAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ResourceQuotaAttribute, JsonValue>>;
				row: Row<Record<ResourceQuotaAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						numerator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.used?.['requests.cpu'] ?? ' - ',
						denominator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.hard?.['requests.cpu'] ?? ' - '
					} satisfies RatioMetadata
				}),
			accessorKey: 'CPU Request',
			size: 100
		},
		{
			id: 'Memory Request',
			header: ({ column }: { column: Column<Record<ResourceQuotaAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ResourceQuotaAttribute, JsonValue>>;
				row: Row<Record<ResourceQuotaAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						numerator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.used?.['requests.memory'] ??
							' - ',
						denominator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.hard?.['requests.memory'] ??
							' - '
					} satisfies RatioMetadata
				}),
			accessorKey: 'Memory Request',
			size: 100
		},
		{
			id: 'CPU Limit',
			header: ({ column }: { column: Column<Record<ResourceQuotaAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ResourceQuotaAttribute, JsonValue>>;
				row: Row<Record<ResourceQuotaAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						numerator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.used?.['limits.cpu'] ?? ' - ',
						denominator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.hard?.['limits.cpu'] ?? ' - '
					} satisfies RatioMetadata
				}),
			accessorKey: 'CPU Limit',
			size: 100
		},
		{
			id: 'Memory Limit',
			header: ({ column }: { column: Column<Record<ResourceQuotaAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ResourceQuotaAttribute, JsonValue>>;
				row: Row<Record<ResourceQuotaAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						numerator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.used?.['limits.memory'] ?? ' - ',
						denominator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.hard?.['limits.memory'] ?? ' - '
					} satisfies RatioMetadata
				}),
			accessorKey: 'Memory Limit',
			size: 100
		},

		{
			id: 'GPU Memory Limit',
			header: ({ column }: { column: Column<Record<ResourceQuotaAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ResourceQuotaAttribute, JsonValue>>;
				row: Row<Record<ResourceQuotaAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						numerator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.used?.[
								'limits.nvidia.com/gpumem'
							] ?? ' - ',
						denominator:
							(row.original['raw'] as CoreV1ResourceQuota).status?.hard?.[
								'limits.nvidia.com/gpumem'
							] ?? ' - '
					} satisfies RatioMetadata
				}),
			accessorKey: 'GPU Memory Limit',
			size: 100
		}
	];
}

export {
	getResourceQuotaColumnDefinitions,
	getResourceQuotaData,
	getResourceQuotaDataSchemas,
	getResourceQuotaUISchemas
};

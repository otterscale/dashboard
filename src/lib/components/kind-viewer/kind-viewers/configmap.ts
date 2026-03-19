import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1ConfigMap } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import {
	type ArrayOfObjectItemsType,
	type ArrayOfObjectMetadata
} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

// kubectl get configmap
// NAME   DATA   AGE
type ConfigMapAttribute = 'Name' | 'Namespace' | 'Data' | 'Age' | 'raw';

function getConfigMapDataSchemas(): Record<ConfigMapAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Data: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getConfigMapData(object: CoreV1ConfigMap): Record<ConfigMapAttribute, JsonValue> {
	const dataCount =
		Object.keys(object?.data ?? {}).length + Object.keys(object?.binaryData ?? {}).length;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Data: dataCount,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getConfigMapUISchemas(): Record<ConfigMapAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Data: 'array-of-object',
		Age: 'time',
		raw: 'object'
	};
}

function getConfigMapColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ConfigMapAttribute, UISchemaType>,
	dataSchemas: Record<ConfigMapAttribute, DataSchemaType>
): ColumnDef<Record<ConfigMapAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ConfigMapAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ConfigMapAttribute, JsonValue>>;
				row: Row<Record<ConfigMapAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ConfigMapAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ConfigMapAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ConfigMapAttribute, JsonValue>>;
				row: Row<Record<ConfigMapAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Data',
			header: ({ column }: { column: Column<Record<ConfigMapAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ConfigMapAttribute, JsonValue>>;
				row: Row<Record<ConfigMapAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: Object.entries((row.original.raw as CoreV1ConfigMap).data ?? {}).map(
							([key, value]) => ({
								title: key,
								description: String(value).substring(0, 64),
								raw: { key, value }
							})
						) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Data'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<ConfigMapAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ConfigMapAttribute, JsonValue>>;
				row: Row<Record<ConfigMapAttribute, JsonValue>>;
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
	getConfigMapColumnDefinitions,
	getConfigMapData,
	getConfigMapDataSchemas,
	getConfigMapUISchemas
};

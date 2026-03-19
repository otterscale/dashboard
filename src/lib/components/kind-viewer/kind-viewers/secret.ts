import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Secret } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

// kubectl get secret
// NAME   TYPE   DATA   AGE
type SecretAttribute = 'Name' | 'Namespace' | 'Type' | 'Data' | 'Age' | 'raw';

function getSecretDataSchemas(): Record<SecretAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Type: 'text',
		Data: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getSecretData(object: CoreV1Secret): Record<SecretAttribute, JsonValue> {
	const dataCount = Object.keys(object?.data ?? {}).length;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Type: object?.type ?? null,
		Data: dataCount,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getSecretUISchemas(): Record<SecretAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Type: 'text',
		Data: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getSecretColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<SecretAttribute, UISchemaType>,
	dataSchemas: Record<SecretAttribute, DataSchemaType>
): ColumnDef<Record<SecretAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<SecretAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<SecretAttribute, JsonValue>>;
				row: Row<Record<SecretAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as SecretAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<SecretAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<SecretAttribute, JsonValue>>;
				row: Row<Record<SecretAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Type',
			header: ({ column }: { column: Column<Record<SecretAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<SecretAttribute, JsonValue>>;
				row: Row<Record<SecretAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Type'
		},
		{
			id: 'Data',
			header: ({ column }: { column: Column<Record<SecretAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<SecretAttribute, JsonValue>>;
				row: Row<Record<SecretAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Data'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<SecretAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<SecretAttribute, JsonValue>>;
				row: Row<Record<SecretAttribute, JsonValue>>;
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

export { getSecretColumnDefinitions, getSecretData, getSecretDataSchemas, getSecretUISchemas };

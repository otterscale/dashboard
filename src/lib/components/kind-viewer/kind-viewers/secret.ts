import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Secret } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get secret
// NAME   TYPE   DATA   AGE
type SecretAttribute = 'Namespace' | 'Name' | 'Type' | 'Data' | 'Age' | 'raw';

function getSecretDataSchemas(): Record<SecretAttribute, DataSchemaType> {
	return {
		Namespace: 'text',
		Name: 'text',
		Type: 'text',
		Data: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getSecretData(object: CoreV1Secret): Record<SecretAttribute, JsonValue> {
	const dataCount = Object.keys(object?.data ?? {}).length;

	return {
		Namespace: object?.metadata?.namespace ?? null,
		Name: object?.metadata?.name ?? null,
		Type: object?.type ?? null,
		Data: dataCount,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getSecretUISchemas(): Record<SecretAttribute, UISchemaType> {
	return {
		Namespace: 'text',
		Name: 'link',
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
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as SecretAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
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

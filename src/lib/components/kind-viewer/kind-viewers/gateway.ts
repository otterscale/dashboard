import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { GatewayNetworkingK8SIoV1Gateway } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import {
	type ArrayOfObjectItemsType,
	type ArrayOfObjectMetadata
} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get gateway -o wide
// NAME   CLASS   ADDRESS   PROGRAMMED   AGE
type GatewayAttribute =
	| 'Namespace'
	| 'Name'
	| 'Class'
	| 'Listeners'
	| 'Addresses'
	| 'Age'
	| 'raw';

function getGatewayDataSchemas(): Record<GatewayAttribute, DataSchemaType> {
	return {
		Namespace: 'text',
		Name: 'text',
		Class: 'text',
		Listeners: 'number',
		Addresses: 'object',
		Age: 'time',
		raw: 'object'
	};
}

function getGatewayData(
	object: GatewayNetworkingK8SIoV1Gateway
): Record<GatewayAttribute, JsonValue> {
	const statusAddresses = object?.status?.addresses ?? [];
	const specAddresses = Array.isArray(object?.spec?.addresses) ? object.spec.addresses : [];
	const addresses = statusAddresses.length > 0 ? statusAddresses : specAddresses;

	return {
		Namespace: object?.metadata?.namespace ?? null,
		Name: object?.metadata?.name ?? null,
		Class: object?.spec?.gatewayClassName ?? null,
		Listeners: object?.spec?.listeners?.length ?? 0,
		Addresses: (addresses as JsonValue) ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getGatewayUISchemas(): Record<GatewayAttribute, UISchemaType> {
	return {
		Namespace: 'text',
		Name: 'link',
		Class: 'text',
		Listeners: 'number',
		Addresses: 'array-of-object',
		Age: 'time',
		raw: 'object'
	};
}

function getGatewayColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<GatewayAttribute, UISchemaType>,
	dataSchemas: Record<GatewayAttribute, DataSchemaType>
): ColumnDef<Record<GatewayAttribute, JsonValue>>[] {
	return [
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<GatewayAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GatewayAttribute, JsonValue>>;
				row: Row<Record<GatewayAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<GatewayAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GatewayAttribute, JsonValue>>;
				row: Row<Record<GatewayAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as GatewayAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Class',
			header: ({ column }: { column: Column<Record<GatewayAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GatewayAttribute, JsonValue>>;
				row: Row<Record<GatewayAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Class'
		},
		{
			id: 'Listeners',
			header: ({ column }: { column: Column<Record<GatewayAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GatewayAttribute, JsonValue>>;
				row: Row<Record<GatewayAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Listeners',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Addresses',
			header: ({ column }: { column: Column<Record<GatewayAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GatewayAttribute, JsonValue>>;
				row: Row<Record<GatewayAttribute, JsonValue>>;
			}) => {
				const raw = row.original.raw as GatewayNetworkingK8SIoV1Gateway;
				const statusAddresses = raw?.status?.addresses ?? [];
				const specAddresses = Array.isArray(raw?.spec?.addresses) ? raw.spec.addresses : [];
				const addresses = statusAddresses.length > 0 ? statusAddresses : specAddresses;
				return renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: addresses.map((addr) => ({
							title: addr.value,
							description: addr.type ?? null,
							raw: addr as JsonObject
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				});
			},
			accessorKey: 'Addresses',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<GatewayAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GatewayAttribute, JsonValue>>;
				row: Row<Record<GatewayAttribute, JsonValue>>;
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
	getGatewayColumnDefinitions,
	getGatewayData,
	getGatewayDataSchemas,
	getGatewayUISchemas
};

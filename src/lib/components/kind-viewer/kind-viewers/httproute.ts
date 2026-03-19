import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { GatewayNetworkingK8SIoV1HTTPRoute } from '@otterscale/types';
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

// kubectl get httproute -o wide
// NAME   HOSTNAMES   PARENT   AGE
type HTTPRouteAttribute = 'Name' | 'Namespace' | 'Hostnames' | 'Parent' | 'Age' | 'raw';

function getHTTPRouteDataSchemas(): Record<HTTPRouteAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Hostnames: 'object',
		Parent: 'object',
		Age: 'time',
		raw: 'object'
	};
}

function getHTTPRouteData(
	object: GatewayNetworkingK8SIoV1HTTPRoute
): Record<HTTPRouteAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Hostnames: (object?.spec?.hostnames as JsonValue) ?? null,
		Parent: (object?.spec?.parentRefs as JsonValue) ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getHTTPRouteUISchemas(): Record<HTTPRouteAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Hostnames: 'array-of-object',
		Parent: 'array-of-object',
		Age: 'time',
		raw: 'object'
	};
}

function getHTTPRouteColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<HTTPRouteAttribute, UISchemaType>,
	dataSchemas: Record<HTTPRouteAttribute, DataSchemaType>
): ColumnDef<Record<HTTPRouteAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<HTTPRouteAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HTTPRouteAttribute, JsonValue>>;
				row: Row<Record<HTTPRouteAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as HTTPRouteAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<HTTPRouteAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HTTPRouteAttribute, JsonValue>>;
				row: Row<Record<HTTPRouteAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Hostnames',
			header: ({ column }: { column: Column<Record<HTTPRouteAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HTTPRouteAttribute, JsonValue>>;
				row: Row<Record<HTTPRouteAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (
							(row.original.raw as GatewayNetworkingK8SIoV1HTTPRoute).spec?.hostnames ?? []
						).map((hostname) => ({
							title: hostname,
							description: null,
							raw: { hostname }
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Hostnames'
		},
		{
			id: 'Parent',
			header: ({ column }: { column: Column<Record<HTTPRouteAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HTTPRouteAttribute, JsonValue>>;
				row: Row<Record<HTTPRouteAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (
							(row.original.raw as GatewayNetworkingK8SIoV1HTTPRoute).spec?.parentRefs ?? []
						).map((ref) => ({
							title: ref.name,
							description: ref.namespace ?? null,
							raw: ref as JsonObject
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Parent',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<HTTPRouteAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HTTPRouteAttribute, JsonValue>>;
				row: Row<Record<HTTPRouteAttribute, JsonValue>>;
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
	getHTTPRouteColumnDefinitions,
	getHTTPRouteData,
	getHTTPRouteDataSchemas,
	getHTTPRouteUISchemas
};

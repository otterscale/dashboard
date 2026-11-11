import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
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

import { buildResourceDetailUrl, type Condition, summarizeConditions } from '../utils';

type ListenerSetObject = {
	metadata?: {
		name?: string;
		namespace?: string;
		creationTimestamp?: string;
	};
	spec?: {
		parentRef?: { group?: string; kind?: string; name?: string; namespace?: string };
		listeners?: {
			name?: string;
			hostname?: string;
			port?: number;
			protocol?: string;
		}[];
	};
	status?: {
		conditions?: Condition[];
	};
};

// kubectl get listenerset -o wide
// NAME   PARENT   ACCEPTED   PROGRAMMED   AGE
type ListenerSetAttribute =
	| 'Name'
	| 'Namespace'
	| 'Parent'
	| 'Hostnames'
	| 'Listeners'
	| 'Status'
	| 'Age'
	| 'raw';

function getListenerSetDataSchemas(): Record<ListenerSetAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Parent: 'number',
		Hostnames: 'text',
		Listeners: 'number',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getListenerSetData(object: ListenerSetObject): Record<ListenerSetAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Parent: object?.spec?.parentRef ? 1 : 0,
		Hostnames:
			object?.spec?.listeners
				?.map((listener) => listener.hostname)
				.filter((hostname) => hostname != null)
				.join(', ') || null,
		Listeners: object?.spec?.listeners?.length ?? 0,
		Status: summarizeConditions(object?.status?.conditions, ['Accepted', 'Programmed']),
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getListenerSetUISchemas(): Record<ListenerSetAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Parent: 'array-of-object',
		Hostnames: 'text',
		Listeners: 'array-of-object',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getListenerSetColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ListenerSetAttribute, UISchemaType>,
	dataSchemas: Record<ListenerSetAttribute, DataSchemaType>
): ColumnDef<Record<ListenerSetAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ListenerSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ListenerSetAttribute, JsonValue>>;
				row: Row<Record<ListenerSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ListenerSetAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ListenerSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ListenerSetAttribute, JsonValue>>;
				row: Row<Record<ListenerSetAttribute, JsonValue>>;
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
			id: 'Parent',
			header: ({ column }: { column: Column<Record<ListenerSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ListenerSetAttribute, JsonValue>>;
				row: Row<Record<ListenerSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: [(row.original.raw as ListenerSetObject).spec?.parentRef]
							.filter((ref) => ref != null)
							.map((ref) => ({
								title: ref.name,
								description: ref.namespace ?? null,
								raw: ref as JsonObject
							})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Parent'
		},
		{
			id: 'Hostnames',
			header: ({ column }: { column: Column<Record<ListenerSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ListenerSetAttribute, JsonValue>>;
				row: Row<Record<ListenerSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Hostnames'
		},
		{
			id: 'Listeners',
			header: ({ column }: { column: Column<Record<ListenerSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ListenerSetAttribute, JsonValue>>;
				row: Row<Record<ListenerSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: ((row.original.raw as ListenerSetObject).spec?.listeners ?? []).map(
							(listener) => ({
								title: listener.name,
								description: [listener.protocol, listener.port]
									.filter((part) => part != null)
									.join(' '),
								raw: listener as JsonObject
							})
						) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Listeners',
			meta: { class: 'hidden xl:table-cell' }
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<ListenerSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ListenerSetAttribute, JsonValue>>;
				row: Row<Record<ListenerSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<ListenerSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ListenerSetAttribute, JsonValue>>;
				row: Row<Record<ListenerSetAttribute, JsonValue>>;
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
	getListenerSetColumnDefinitions,
	getListenerSetData,
	getListenerSetDataSchemas,
	getListenerSetUISchemas
};
import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1Namespace } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get namespace
// NAME   STATUS   AGE
type NamespaceAttribute = 'Name' | 'Status' | 'Age' | 'raw';

function getNamespaceDataSchemas(): Record<NamespaceAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getNamespaceData(object: CoreV1Namespace): Record<NamespaceAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Status: object?.status?.phase ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getNamespaceUISchemas(): Record<NamespaceAttribute, UISchemaType> {
	return {
		Name: 'link',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getNamespaceColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<NamespaceAttribute, UISchemaType>,
	dataSchemas: Record<NamespaceAttribute, DataSchemaType>
): ColumnDef<Record<NamespaceAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: NamespaceAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<NamespaceAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<NamespaceAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<NamespaceAttribute, JsonValue>>;
			row: Row<Record<NamespaceAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<NamespaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<NamespaceAttribute, JsonValue>>;
				row: Row<Record<NamespaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as NamespaceAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Status'),
		simpleColumn('Age')
	];
}

export {
	getNamespaceColumnDefinitions,
	getNamespaceData,
	getNamespaceDataSchemas,
	getNamespaceUISchemas
};

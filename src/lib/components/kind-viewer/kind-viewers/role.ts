import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { RbacAuthorizationK8SIoV1Role } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

// kubectl get role
// NAME   NAMESPACE   CREATED AT
type RoleAttribute = 'Name' | 'Namespace' | 'Rules' | 'Age' | 'raw';

function getRoleDataSchemas(): Record<RoleAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Rules: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getRoleData(object: RbacAuthorizationK8SIoV1Role): Record<RoleAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Rules: object?.rules?.length ?? 0,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getRoleUISchemas(): Record<RoleAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'link',
		Rules: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getRoleColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<RoleAttribute, UISchemaType>,
	dataSchemas: Record<RoleAttribute, DataSchemaType>
): ColumnDef<Record<RoleAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: RoleAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<RoleAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<RoleAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<RoleAttribute, JsonValue>>;
			row: Row<Record<RoleAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<RoleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<RoleAttribute, JsonValue>>;
				row: Row<Record<RoleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original[column.id as RoleAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<RoleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<RoleAttribute, JsonValue>>;
				row: Row<Record<RoleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original['Namespace']}?group=&version=v1&kind=Namespace&resource=namespaces&namespaced=false`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Namespace'
		},
		simpleColumn('Rules'),
		simpleColumn('Age')
	];
}

export { getRoleColumnDefinitions, getRoleData, getRoleDataSchemas, getRoleUISchemas };

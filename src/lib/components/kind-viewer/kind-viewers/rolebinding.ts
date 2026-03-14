import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { RbacAuthorizationK8SIoV1RoleBinding } from '@otterscale/types';
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

// kubectl get rolebinding -o wide
// NAME   NAMESPACE   ROLE   AGE   USERS   GROUPS   SERVICEACCOUNTS
type RoleBindingAttribute = 'Namespace' | 'Name' | 'Role' | 'Age' | 'Subjects' | 'raw';

function getRoleBindingDataSchemas(): Record<RoleBindingAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Role: 'text',
		Age: 'time',
		Subjects: 'object',
		raw: 'object'
	};
}

function getRoleBindingData(
	object: RbacAuthorizationK8SIoV1RoleBinding
): Record<RoleBindingAttribute, JsonValue> {
	const roleRef = object?.roleRef;
	const roleDisplay = roleRef ? `${roleRef.kind}/${roleRef.name}` : null;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Role: roleDisplay,
		Age: object?.metadata?.creationTimestamp ?? null,
		Subjects: (object?.subjects as JsonValue) ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getRoleBindingUISchemas(): Record<RoleBindingAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Role: 'text',
		Age: 'time',
		Subjects: 'array-of-object',
		raw: 'object'
	};
}

function getRoleBindingColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<RoleBindingAttribute, UISchemaType>,
	dataSchemas: Record<RoleBindingAttribute, DataSchemaType>
): ColumnDef<Record<RoleBindingAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: RoleBindingAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<RoleBindingAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<RoleBindingAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<RoleBindingAttribute, JsonValue>>;
			row: Row<Record<RoleBindingAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		simpleColumn('Namespace'),
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<RoleBindingAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<RoleBindingAttribute, JsonValue>>;
				row: Row<Record<RoleBindingAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as RoleBindingAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Role'),
		simpleColumn('Age'),
		{
			id: 'Subjects',
			header: ({ column }: { column: Column<Record<RoleBindingAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<RoleBindingAttribute, JsonValue>>;
				row: Row<Record<RoleBindingAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						items: ((row.original.raw as RbacAuthorizationK8SIoV1RoleBinding).subjects ?? []).map(
							(s) => ({
								title: s.name,
								description: `${s.kind}${s.namespace ? ` (${s.namespace})` : ''}`,
								raw: s as JsonObject
							})
						) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Subjects',
			meta: { class: 'hidden xl:table-cell' }
		}
	];
}

export {
	getRoleBindingColumnDefinitions,
	getRoleBindingData,
	getRoleBindingDataSchemas,
	getRoleBindingUISchemas
};

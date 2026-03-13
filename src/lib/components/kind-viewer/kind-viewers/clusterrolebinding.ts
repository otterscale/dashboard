import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { RbacAuthorizationK8SIoV1ClusterRoleBinding } from '@otterscale/types';
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

// kubectl get clusterrolebinding -o wide
// NAME   ROLE   AGE   USERS   GROUPS   SERVICEACCOUNTS
type ClusterRoleBindingAttribute =
	| 'Name'
	| 'Role'
	| 'Age'
	| 'Subjects'
	| 'raw';

function getClusterRoleBindingDataSchemas(): Record<ClusterRoleBindingAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Role: 'text',
		Age: 'time',
		Subjects: 'object',
		raw: 'object'
	};
}

function getClusterRoleBindingData(
	object: RbacAuthorizationK8SIoV1ClusterRoleBinding
): Record<ClusterRoleBindingAttribute, JsonValue> {
	const roleRef = object?.roleRef;
	const roleDisplay = roleRef ? `${roleRef.kind}/${roleRef.name}` : null;

	return {
		Name: object?.metadata?.name ?? null,
		Role: roleDisplay,
		Age: object?.metadata?.creationTimestamp ?? null,
		Subjects: (object?.subjects as JsonValue) ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getClusterRoleBindingUISchemas(): Record<ClusterRoleBindingAttribute, UISchemaType> {
	return {
		Name: 'link',
		Role: 'text',
		Age: 'time',
		Subjects: 'array-of-object',
		raw: 'object'
	};
}

function getClusterRoleBindingColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ClusterRoleBindingAttribute, UISchemaType>,
	dataSchemas: Record<ClusterRoleBindingAttribute, DataSchemaType>
): ColumnDef<Record<ClusterRoleBindingAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: ClusterRoleBindingAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<ClusterRoleBindingAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<ClusterRoleBindingAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<ClusterRoleBindingAttribute, JsonValue>>;
			row: Row<Record<ClusterRoleBindingAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ClusterRoleBindingAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ClusterRoleBindingAttribute, JsonValue>>;
				row: Row<Record<ClusterRoleBindingAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as ClusterRoleBindingAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Role'),
		simpleColumn('Age'),
		{
			id: 'Subjects',
			header: ({
				column
			}: {
				column: Column<Record<ClusterRoleBindingAttribute, JsonValue>>;
			}) => renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ClusterRoleBindingAttribute, JsonValue>>;
				row: Row<Record<ClusterRoleBindingAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						items: (
							(row.original.raw as RbacAuthorizationK8SIoV1ClusterRoleBinding).subjects ?? []
						).map((s) => ({
							title: s.name,
							description: `${s.kind}${s.namespace ? ` (${s.namespace})` : ''}`,
							raw: s as JsonObject
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Subjects',
			meta: { class: 'hidden xl:table-cell' }
		}
	];
}

export {
	getClusterRoleBindingColumnDefinitions,
	getClusterRoleBindingData,
	getClusterRoleBindingDataSchemas,
	getClusterRoleBindingUISchemas
};

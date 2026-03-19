import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { RbacAuthorizationK8SIoV1ClusterRole } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

// kubectl get clusterrole
// NAME   CREATED AT
type ClusterRoleAttribute = 'Name' | 'Rules' | 'Age' | 'raw';

function getClusterRoleDataSchemas(): Record<ClusterRoleAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Rules: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getClusterRoleData(
	object: RbacAuthorizationK8SIoV1ClusterRole
): Record<ClusterRoleAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Rules: object?.rules?.length ?? 0,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getClusterRoleUISchemas(): Record<ClusterRoleAttribute, UISchemaType> {
	return {
		Name: 'link',
		Rules: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getClusterRoleColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ClusterRoleAttribute, UISchemaType>,
	dataSchemas: Record<ClusterRoleAttribute, DataSchemaType>
): ColumnDef<Record<ClusterRoleAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: ClusterRoleAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<ClusterRoleAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<ClusterRoleAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<ClusterRoleAttribute, JsonValue>>;
			row: Row<Record<ClusterRoleAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ClusterRoleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ClusterRoleAttribute, JsonValue>>;
				row: Row<Record<ClusterRoleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ClusterRoleAttribute] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Rules'),
		simpleColumn('Age')
	];
}

export {
	getClusterRoleColumnDefinitions,
	getClusterRoleData,
	getClusterRoleDataSchemas,
	getClusterRoleUISchemas
};

import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { TenantOtterscaleIoV1Alpha1Workspace } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type {
	ArrayOfObjectItemType,
	ArrayOfObjectMetadata
} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import type { QuantityMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/quantity-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from '../utils';

type WorkspaceAttribute =
	| 'Name'
	| 'Namespace'
	| 'Admin'
	| 'Members'
	| 'CPU Request'
	| 'Memory Request'
	| 'CPU Limit'
	| 'Memory Limit'
	| 'GPU Memory Limit'
	| 'Age'
	| 'raw';

function getWorkspaceDataSchemas(): Record<WorkspaceAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Admin: 'text',
		Members: 'number',
		'CPU Request': 'quantity',
		'Memory Request': 'quantity',
		'CPU Limit': 'quantity',
		'Memory Limit': 'quantity',
		'GPU Memory Limit': 'quantity',
		Age: 'time',
		raw: 'object'
	};
}

function getWorkspaceData(
	object: TenantOtterscaleIoV1Alpha1Workspace
): Record<WorkspaceAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.spec?.namespace ?? null,
		Admin: object?.spec?.members.find((member) => member.role === 'admin')?.name ?? null,
		Members: (object?.spec?.members ?? []).length,
		'CPU Request': object?.spec?.resourceQuota?.hard?.['requests.cpu'] ?? null,
		'Memory Request': object?.spec?.resourceQuota?.hard?.['requests.memory'] ?? null,
		'CPU Limit': object?.spec?.resourceQuota?.hard?.['limits.cpu'] ?? null,
		'Memory Limit': object?.spec?.resourceQuota?.hard?.['limits.memory'] ?? null,
		'GPU Memory Limit': object?.spec?.resourceQuota?.hard?.['limits.nvidia.com/gpumem'] ?? null,
		Age: object?.metadata?.creationTimestamp as JsonValue,
		raw: object as JsonObject
	};
}

function getWorkspaceUISchemas(): Record<WorkspaceAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Admin: 'text',
		Members: 'array-of-object',
		'CPU Request': 'quantity',
		'Memory Request': 'quantity',
		'CPU Limit': 'quantity',
		'Memory Limit': 'quantity',
		'GPU Memory Limit': 'quantity',
		Age: 'time',
		raw: 'object'
	};
}

function getWorkspaceColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<WorkspaceAttribute, UISchemaType>,
	dataSchemas: Record<string, DataSchemaType>
): ColumnDef<Record<WorkspaceAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as WorkspaceAttribute] as string
						)
					} as LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
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
			id: 'Admin',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Admin'
		},
		{
			id: 'Members',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as TenantOtterscaleIoV1Alpha1Workspace).spec?.members?.map(
							(member) =>
								({
									title: member?.name,
									description: member?.subject,
									actions: member?.role
								}) as ArrayOfObjectItemType
						)
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Members'
		},
		{
			id: 'CPU Request',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: { type: 'continuous' } as QuantityMetadata
				}),
			accessorKey: 'CPU Request'
		},
		{
			id: 'Memory Request',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: { type: 'discrete' } as QuantityMetadata
				}),
			accessorKey: 'Memory Request'
		},
		{
			id: 'CPU Limit',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: { type: 'continuous' } as QuantityMetadata
				}),
			accessorKey: 'CPU Limit'
		},
		{
			id: 'Memory Limit',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: { type: 'discrete' } as QuantityMetadata
				}),
			accessorKey: 'Memory Limit'
		},
		{
			id: 'GPU Memory Limit',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: { type: 'discrete', baseUnit: 'Mi' } as QuantityMetadata
				}),
			accessorKey: 'GPU Memory Limit'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<WorkspaceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<WorkspaceAttribute, JsonValue>>;
				row: Row<Record<WorkspaceAttribute, JsonValue>>;
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
	getWorkspaceColumnDefinitions,
	getWorkspaceData,
	getWorkspaceDataSchemas,
	getWorkspaceUISchemas
};

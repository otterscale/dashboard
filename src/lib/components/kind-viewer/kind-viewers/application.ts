import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type ApplicationAttribute =
	| 'Name'
	| 'Namespace'
	| 'State'
	| 'Ready'
	| 'ServiceType'
	| 'ServicePort'
	| 'Age'
	| 'raw';

function getApplicationDataSchemas(): Record<ApplicationAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		State: 'text',
		Ready: 'text',
		ServiceType: 'text',
		ServicePort: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getApplicationData(object: any): Record<ApplicationAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition: any) => condition.type === 'Ready'
	);

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		State: object?.status?.state ?? null,
		Ready:
			readyCondition?.status === 'True'
				? 'True'
				: readyCondition?.status === 'False'
					? 'False'
					: '',
		ServiceType: object?.spec?.serviceType ?? null,
		ServicePort: object?.status?.nodePort != null ? String(object.status.nodePort) : null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getApplicationUISchemas(): Record<ApplicationAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		State: 'text',
		Ready: 'text',
		ServiceType: 'text',
		ServicePort: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getApplicationColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ApplicationAttribute, UISchemaType>,
	dataSchemas: Record<ApplicationAttribute, DataSchemaType>
): ColumnDef<Record<ApplicationAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ApplicationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ApplicationAttribute, JsonValue>>;
				row: Row<Record<ApplicationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ApplicationAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<ApplicationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ApplicationAttribute, JsonValue>>;
				row: Row<Record<ApplicationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'State',
			header: ({ column }: { column: Column<Record<ApplicationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ApplicationAttribute, JsonValue>>;
				row: Row<Record<ApplicationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'State'
		},
		{
			id: 'Ready',
			header: ({ column }: { column: Column<Record<ApplicationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ApplicationAttribute, JsonValue>>;
				row: Row<Record<ApplicationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Ready'
		},
		{
			id: 'ServiceType',
			header: ({ column }: { column: Column<Record<ApplicationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ApplicationAttribute, JsonValue>>;
				row: Row<Record<ApplicationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'ServiceType'
		},
		{
			id: 'ServicePort',
			header: ({ column }: { column: Column<Record<ApplicationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ApplicationAttribute, JsonValue>>;
				row: Row<Record<ApplicationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'ServicePort'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<ApplicationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ApplicationAttribute, JsonValue>>;
				row: Row<Record<ApplicationAttribute, JsonValue>>;
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
	getApplicationColumnDefinitions,
	getApplicationData,
	getApplicationDataSchemas,
	getApplicationUISchemas
};

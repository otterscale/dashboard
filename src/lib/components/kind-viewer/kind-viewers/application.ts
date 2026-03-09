import { type JsonValue } from '@bufbuild/protobuf';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { APIResource } from '$lib/api/resource/v1/resource_pb';
import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import type { QuantityMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/quantity-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

type ApplicationAttribute =
	| 'Name'
	| 'Namespace'
	| 'Ready'
	| 'Image'
	| 'Replicas'
	| 'Storage'
	| 'Service Type'
	| 'Age'
	| 'raw';

function getApplicationDataSchemas(): Record<ApplicationAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Ready: 'boolean',
		Image: 'text',
		Replicas: 'number',
		Storage: 'quantity',
		'Service Type': 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getApplicationData(object: any): Record<ApplicationAttribute, JsonValue> {
	// Parse Ready status from conditions array
	// JSONPath: .status.conditions[?(@.type=="Ready")].status
	let ready: JsonValue = null;
	if (object?.status?.conditions && Array.isArray(object.status.conditions)) {
		const readyCondition = object.status.conditions.find(
			(condition: any) => condition?.type === 'Ready'
		);

		ready =
			readyCondition?.status === 'True' ? true : readyCondition?.status === 'False' ? false : null;
	}

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Ready: ready ?? null,
		Image: object?.spec?.deploymentSpec?.image ?? null,
		Replicas: object?.spec?.deploymentSpec?.replicas ?? null,
		Storage: object?.spec?.pvcSpec?.resources?.requests?.storage ?? null,
		'Service Type': object?.spec?.serviceSpec?.type ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: object ?? null
	};
}

function getApplicationUISchemas(): Record<ApplicationAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'link',
		Ready: 'boolean',
		Image: 'text',
		Replicas: 'number',
		Storage: 'quantity',
		'Service Type': 'text',
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
						hyperlink: resolve(
							`/(auth)/${page.params.cluster!}/${apiResource.kind}/${apiResource.resource}?group=${apiResource.group}&version=${apiResource.version}&name=${row.original[column.id as ApplicationAttribute]}&namespace=${page.url.searchParams.get('namespace') ?? ''}`
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
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster!}/Namespace/namespaces?group=&version=v1&name=${row.original['Namespace']}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Namespace'
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
			id: 'Service Type',
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
			accessorKey: 'Service Type'
		},
		{
			id: 'Image',
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
			accessorKey: 'Image'
		},
		{
			id: 'Replicas',
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
			accessorKey: 'Replicas'
		},
		{
			id: 'Storage',
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
						type: 'discrete'
					} satisfies QuantityMetadata
				}),
			accessorKey: 'Storage'
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


import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { AppsV1DaemonSet } from '@otterscale/types';
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

// kubectl get daemonset -o wide
// NAME   DESIRED   CURRENT   READY   UP-TO-DATE   AVAILABLE   NODE SELECTOR   AGE   CONTAINERS   IMAGES   SELECTOR
type DaemonSetAttribute =
	| 'Namespace'
	| 'Name'
	| 'Desired'
	| 'Current'
	| 'Ready'
	| 'Up-To-Date'
	| 'Available'
	| 'Node Selector'
	| 'Age'
	| 'Containers'
	| 'Images'
	| 'Selector'
	| 'raw';

function getDaemonSetDataSchemas(): Record<DaemonSetAttribute, DataSchemaType> {
	return {
		Namespace: 'text',
		Name: 'text',
		Desired: 'number',
		Current: 'number',
		Ready: 'number',
		'Up-To-Date': 'number',
		Available: 'number',
		'Node Selector': 'number',
		Age: 'time',
		Containers: 'number',
		Images: 'number',
		Selector: 'number',
		raw: 'object'
	};
}

function getDaemonSetData(object: AppsV1DaemonSet): Record<DaemonSetAttribute, JsonValue> {
	const nodeSelectorLabels = object?.spec?.template?.spec?.nodeSelector ?? {};
	const selectorLabels = object?.spec?.selector?.matchLabels ?? {};

	return {
		Namespace: object?.metadata?.namespace ?? null,
		Name: object?.metadata?.name ?? null,
		Desired: object?.status?.desiredNumberScheduled ?? null,
		Current: object?.status?.currentNumberScheduled ?? null,
		Ready: object?.status?.numberReady ?? null,
		'Up-To-Date': object?.status?.updatedNumberScheduled ?? null,
		Available: object?.status?.numberAvailable ?? null,
		'Node Selector': Object.keys(nodeSelectorLabels).length,
		Age: object?.metadata?.creationTimestamp ?? null,
		Containers: object?.spec?.template?.spec?.containers?.length ?? null,
		Images:
			new Set(object?.spec?.template?.spec?.containers?.map((container) => container.image)).size ??
			null,
		Selector: Object.keys(selectorLabels).length,
		raw: (object as JsonObject) ?? null
	};
}

function getDaemonSetUISchemas(): Record<DaemonSetAttribute, UISchemaType> {
	return {
		Namespace: 'text',
		Name: 'link',
		Desired: 'text',
		Current: 'text',
		Ready: 'text',
		'Up-To-Date': 'text',
		Available: 'text',
		'Node Selector': 'array-of-object',
		Age: 'time',
		Containers: 'array-of-object',
		Images: 'array-of-object',
		Selector: 'array-of-object',
		raw: 'object'
	};
}

function getDaemonSetColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<DaemonSetAttribute, UISchemaType>,
	dataSchemas: Record<DaemonSetAttribute, DataSchemaType>
): ColumnDef<Record<DaemonSetAttribute, JsonValue>>[] {
	return [
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as DaemonSetAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Desired',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Desired'
		},
		{
			id: 'Current',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Current'
		},
		{
			id: 'Ready',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Ready'
		},
		{
			id: 'Up-To-Date',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Up-To-Date'
		},
		{
			id: 'Available',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Available'
		},
		{
			id: 'Node Selector',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: Object.entries(
							(row.original.raw as AppsV1DaemonSet).spec?.template?.spec?.nodeSelector ?? {}
						).map(([key, value]) => ({
							title: key,
							description: value,
							raw: { key, value }
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Node Selector',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Age'
		},
		{
			id: 'Containers',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as AppsV1DaemonSet).spec?.template?.spec?.containers?.map(
							(container) => ({
								title: container.name,
								description: container.command?.join(' '),
								actions: container.image,
								raw: container
							})
						) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Containers',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Images',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as AppsV1DaemonSet).spec?.template?.spec?.containers?.map(
							(container) => ({
								title: container.image,
								description: container.name,
								raw: {
									image: container.image,
									imagePullPolicy: container.imagePullPolicy,
									container: container.name
								}
							})
						) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Images',
			meta: {
				class: 'hidden xl:table-cell'
			}
		},
		{
			id: 'Selector',
			header: ({ column }: { column: Column<Record<DaemonSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DaemonSetAttribute, JsonValue>>;
				row: Row<Record<DaemonSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: Object.entries(
							(row.original.raw as AppsV1DaemonSet).spec?.selector?.matchLabels ?? {}
						).map(([key, value]) => ({
							title: key,
							description: value,
							raw: { key, value }
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Selector',
			meta: {
				class: 'hidden xl:table-cell'
			}
		}
	];
}

export {
	getDaemonSetColumnDefinitions,
	getDaemonSetData,
	getDaemonSetDataSchemas,
	getDaemonSetUISchemas
};

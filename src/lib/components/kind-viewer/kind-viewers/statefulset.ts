import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { AppsV1StatefulSet } from '@otterscale/types';
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

// kubectl get statefulset -o wide
// NAME   READY   AGE   CONTAINERS   IMAGES
type StatefulSetAttribute =
	| 'Name'
	| 'Namespace'
	| 'Ready'
	| 'Age'
	| 'Containers'
	| 'Images'
	| 'raw';

function getStatefulSetDataSchemas(): Record<StatefulSetAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Ready: 'text',
		Age: 'time',
		Containers: 'number',
		Images: 'number',
		raw: 'object'
	};
}

function getStatefulSetData(object: AppsV1StatefulSet): Record<StatefulSetAttribute, JsonValue> {
	const readyReplicas = object?.status?.readyReplicas ?? 0;
	const desiredReplicas = object?.spec?.replicas ?? 0;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Ready: `${readyReplicas}/${desiredReplicas}`,
		Age: object?.metadata?.creationTimestamp ?? null,
		Containers: object?.spec?.template?.spec?.containers?.length ?? null,
		Images:
			new Set(object?.spec?.template?.spec?.containers?.map((container) => container.image)).size ??
			null,
		raw: (object as JsonObject) ?? null
	};
}

function getStatefulSetUISchemas(): Record<StatefulSetAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'link',
		Ready: 'text',
		Age: 'time',
		Containers: 'array-of-object',
		Images: 'array-of-object',
		raw: 'object'
	};
}

function getStatefulSetColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<StatefulSetAttribute, UISchemaType>,
	dataSchemas: Record<StatefulSetAttribute, DataSchemaType>
): ColumnDef<Record<StatefulSetAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<StatefulSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<StatefulSetAttribute, JsonValue>>;
				row: Row<Record<StatefulSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original[column.id as StatefulSetAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<StatefulSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<StatefulSetAttribute, JsonValue>>;
				row: Row<Record<StatefulSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original['Namespace']}?group=&version=v1&kind=Namespace&resource=namespaces&namespaced=false`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Ready',
			header: ({ column }: { column: Column<Record<StatefulSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<StatefulSetAttribute, JsonValue>>;
				row: Row<Record<StatefulSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Ready'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<StatefulSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<StatefulSetAttribute, JsonValue>>;
				row: Row<Record<StatefulSetAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<StatefulSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<StatefulSetAttribute, JsonValue>>;
				row: Row<Record<StatefulSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as AppsV1StatefulSet).spec?.template?.spec?.containers?.map(
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
			header: ({ column }: { column: Column<Record<StatefulSetAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<StatefulSetAttribute, JsonValue>>;
				row: Row<Record<StatefulSetAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as AppsV1StatefulSet).spec?.template?.spec?.containers?.map(
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
		}
	];
}

export {
	getStatefulSetColumnDefinitions,
	getStatefulSetData,
	getStatefulSetDataSchemas,
	getStatefulSetUISchemas
};

import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { AppsV1Deployment } from '@otterscale/types';
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

type DeploymentAttribute =
	| 'Namespace'
	| 'Name'
	| 'Ready'
	| 'Up-To-Date'
	| 'Available'
	| 'Age'
	| 'Containers'
	| 'Images'
	| 'Selector'
	| 'raw';

function getDeploymentDataSchemas(): Record<DeploymentAttribute, DataSchemaType> {
	return {
		Namespace: 'text',
		Name: 'text',
		Ready: 'text',
		'Up-To-Date': 'number',
		Available: 'number',
		Age: 'time',
		Containers: 'number',
		Images: 'number',
		Selector: 'number',
		raw: 'object'
	};
}

function getDeploymentData(object: AppsV1Deployment): Record<DeploymentAttribute, JsonValue> {
	const readyReplicas = object?.status?.readyReplicas ?? 0;
	const desiredReplicas = object?.spec?.replicas ?? 0;

	const selectorLabels = object?.spec?.selector?.matchLabels ?? {};
	const selectorCount = Object.keys(selectorLabels).length;

	return {
		Namespace: object?.metadata?.namespace ?? null,
		Name: object?.metadata?.name ?? null,
		Ready: `${readyReplicas}/${desiredReplicas}`,
		'Up-To-Date': object?.status?.updatedReplicas ?? null,
		Available: object?.status?.availableReplicas ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		Containers: object?.spec?.template?.spec?.containers?.length ?? null,
		Images:
			new Set(
				object?.spec?.template?.spec?.containers?.map((container) => container.image)
			).size ?? null,
		Selector: selectorCount,
		raw: (object as JsonObject) ?? null
	};
}

function getDeploymentUISchemas(): Record<DeploymentAttribute, UISchemaType> {
	return {
		Namespace: 'text',
		Name: 'link',
		Ready: 'text',
		'Up-To-Date': 'text',
		Available: 'text',
		Age: 'time',
		Containers: 'array-of-object',
		Images: 'array-of-object',
		Selector: 'array-of-object',
		raw: 'object'
	};
}

function getDeploymentColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<DeploymentAttribute, UISchemaType>,
	dataSchemas: Record<DeploymentAttribute, DataSchemaType>
): ColumnDef<Record<DeploymentAttribute, JsonValue>>[] {
	return [
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as DeploymentAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Ready',
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Available'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as AppsV1Deployment).spec?.template?.spec?.containers?.map(
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
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as AppsV1Deployment).spec?.template?.spec?.containers?.map(
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
			header: ({ column }: { column: Column<Record<DeploymentAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DeploymentAttribute, JsonValue>>;
				row: Row<Record<DeploymentAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: Object.entries(
							(row.original.raw as AppsV1Deployment).spec?.selector?.matchLabels ?? {}
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
	getDeploymentColumnDefinitions,
	getDeploymentData,
	getDeploymentDataSchemas,
	getDeploymentUISchemas
};

import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { BatchV1Job } from '@otterscale/types';
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

// kubectl get job -o wide
// NAME   COMPLETIONS   DURATION   AGE   CONTAINERS   IMAGES   SELECTOR
type JobAttribute =
	| 'Namespace'
	| 'Name'
	| 'Completions'
	| 'Duration'
	| 'Age'
	| 'Containers'
	| 'Images'
	| 'Selector'
	| 'raw';

function getJobDataSchemas(): Record<JobAttribute, DataSchemaType> {
	return {
		Namespace: 'text',
		Name: 'text',
		Completions: 'text',
		Duration: 'text',
		Age: 'time',
		Containers: 'number',
		Images: 'number',
		Selector: 'number',
		raw: 'object'
	};
}

function calcDuration(startTime?: string, completionTime?: string): string | null {
	if (!startTime) return null;
	const start = new Date(startTime).getTime();
	const end = completionTime ? new Date(completionTime).getTime() : Date.now();
	const diffSeconds = Math.floor((end - start) / 1000);
	if (diffSeconds < 60) return `${diffSeconds}s`;
	const minutes = Math.floor(diffSeconds / 60);
	const seconds = diffSeconds % 60;
	if (minutes < 60) return seconds > 0 ? `${minutes}m${seconds}s` : `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	const remainMinutes = minutes % 60;
	return remainMinutes > 0 ? `${hours}h${remainMinutes}m` : `${hours}h`;
}

function getJobData(object: BatchV1Job): Record<JobAttribute, JsonValue> {
	const succeeded = object?.status?.succeeded ?? 0;
	const completions = object?.spec?.completions ?? 1;
	const selectorLabels = object?.spec?.selector?.matchLabels ?? {};

	return {
		Namespace: object?.metadata?.namespace ?? null,
		Name: object?.metadata?.name ?? null,
		Completions: `${succeeded}/${completions}`,
		Duration: calcDuration(object?.status?.startTime, object?.status?.completionTime),
		Age: object?.metadata?.creationTimestamp ?? null,
		Containers: object?.spec?.template?.spec?.containers?.length ?? null,
		Images:
			new Set(object?.spec?.template?.spec?.containers?.map((container) => container.image)).size ??
			null,
		Selector: Object.keys(selectorLabels).length,
		raw: (object as JsonObject) ?? null
	};
}

function getJobUISchemas(): Record<JobAttribute, UISchemaType> {
	return {
		Namespace: 'text',
		Name: 'link',
		Completions: 'text',
		Duration: 'text',
		Age: 'time',
		Containers: 'array-of-object',
		Images: 'array-of-object',
		Selector: 'array-of-object',
		raw: 'object'
	};
}

function getJobColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<JobAttribute, UISchemaType>,
	dataSchemas: Record<JobAttribute, DataSchemaType>
): ColumnDef<Record<JobAttribute, JsonValue>>[] {
	return [
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.namespace}/${row.original[column.id as JobAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Completions',
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Completions'
		},
		{
			id: 'Duration',
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Duration'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as BatchV1Job).spec?.template?.spec?.containers?.map(
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
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (row.original.raw as BatchV1Job).spec?.template?.spec?.containers?.map(
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
			header: ({ column }: { column: Column<Record<JobAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<JobAttribute, JsonValue>>;
				row: Row<Record<JobAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: Object.entries(
							(row.original.raw as BatchV1Job).spec?.selector?.matchLabels ?? {}
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

export { getJobColumnDefinitions, getJobData, getJobDataSchemas, getJobUISchemas };

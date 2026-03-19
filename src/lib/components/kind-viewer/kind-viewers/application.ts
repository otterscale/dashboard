import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { WorkloadOtterscaleIoV1Alpha1Application } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type {
	ArrayOfObjectItemType,
	ArrayOfObjectMetadata
} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type ApplicationAttribute =
	| 'Name'
	| 'Namespace'
	| 'Workload Type'
	| 'Resources'
	| 'Status'
	| 'Age'
	| 'raw';

function getApplicationDataSchemas(): Record<ApplicationAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Workload Type': 'text',
		Resources: 'number',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getApplicationData(
	object: WorkloadOtterscaleIoV1Alpha1Application
): Record<ApplicationAttribute, JsonValue> {
	const resourcesCount = [
		object.status?.deploymentRef,
		object.status?.cronJobRef,
		object.status?.jobRef,
		object.status?.serviceRef,
		object.status?.persistentVolumeClaimRef
	].filter(Boolean).length;

	const readyCondition = object.status?.conditions?.find((condition) => condition.type === 'Ready');

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Workload Type': object?.spec?.workloadType ?? 'Deployment',
		Resources: resourcesCount,
		Status: readyCondition?.status === 'True' ? 'Ready' : 'Not Ready',
		Age: object?.metadata?.creationTimestamp as JsonValue,
		raw: object as JsonObject
	};
}

function getApplicationUISchemas(): Record<ApplicationAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Workload Type': 'text',
		Resources: 'array-of-object',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getApplicationColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ApplicationAttribute, UISchemaType>,
	dataSchemas: Record<string, DataSchemaType>
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
					} as LinkMetadata
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
			id: 'Workload Type',
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
			accessorKey: 'Workload Type'
		},
		{
			id: 'Resources',
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
			}) => {
				const app = row.original.raw as WorkloadOtterscaleIoV1Alpha1Application;
				const items: ArrayOfObjectItemType[] = [];

				if (app.status?.deploymentRef) {
					items.push({
						title: 'Deployment',
						description: app.status.deploymentRef.name,
						raw: app.status.deploymentRef as any
					});
				}
				if (app.status?.cronJobRef) {
					items.push({
						title: 'CronJob',
						description: app.status.cronJobRef.name,
						raw: app.status.cronJobRef as any
					});
				}
				if (app.status?.jobRef) {
					items.push({
						title: 'Job',
						description: app.status.jobRef.name,
						raw: app.status.jobRef as any
					});
				}
				if (app.status?.serviceRef) {
					items.push({
						title: 'Service',
						description: app.status.serviceRef.name,
						raw: app.status.serviceRef as any
					});
				}
				if (app.status?.persistentVolumeClaimRef) {
					items.push({
						title: 'PVC',
						description: app.status.persistentVolumeClaimRef.name,
						raw: app.status.persistentVolumeClaimRef as any
					});
				}

				return renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items
					} satisfies ArrayOfObjectMetadata
				});
			},
			accessorKey: 'Resources'
		},
		{
			id: 'Status',
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
			accessorKey: 'Status'
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

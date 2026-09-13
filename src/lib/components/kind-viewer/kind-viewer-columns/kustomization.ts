import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { KustomizeToolkitFluxcdIoV1Kustomization } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from '../utils';

type KustomizationAttribute =
	| 'Name'
	| 'Namespace'
	| 'Source'
	| 'Path'
	| 'Revision'
	| 'Interval'
	| 'Status'
	| 'Reason'
	| 'Age'
	| 'raw';

function getKustomizationDataSchemas(): Record<KustomizationAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Source: 'text',
		Path: 'text',
		Revision: 'text',
		Interval: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getKustomizationData(
	object: KustomizeToolkitFluxcdIoV1Kustomization
): Record<KustomizationAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition) => condition.type === 'Ready'
	);
	const sourceRef = object?.spec?.sourceRef;
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Source: sourceRef ? `${sourceRef.kind}/${sourceRef.name}` : null,
		Path: object?.spec?.path ?? null,
		Revision: object?.status?.lastAppliedRevision ?? null,
		Interval: object?.spec?.interval ?? null,
		Status:
			readyCondition?.status === 'True'
				? 'Ready'
				: readyCondition?.status === 'False'
					? readyCondition.reason
					: '',
		Reason: readyCondition?.reason ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getKustomizationUISchemas(): Record<KustomizationAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Source: 'text',
		Path: 'text',
		Revision: 'text',
		Interval: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getKustomizationColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<KustomizationAttribute, UISchemaType>,
	dataSchemas: Record<KustomizationAttribute, DataSchemaType>
): ColumnDef<Record<KustomizationAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as KustomizationAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
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
			id: 'Source',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Source'
		},
		{
			id: 'Path',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Path'
		},
		{
			id: 'Revision',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Revision'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Status'
		},
		{
			id: 'Reason',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Reason'
		},
		{
			id: 'Interval',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Interval'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<KustomizationAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<KustomizationAttribute, JsonValue>>;
				row: Row<Record<KustomizationAttribute, JsonValue>>;
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
	getKustomizationColumnDefinitions,
	getKustomizationData,
	getKustomizationDataSchemas,
	getKustomizationUISchemas
};

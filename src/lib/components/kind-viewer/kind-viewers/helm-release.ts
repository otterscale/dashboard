import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { HelmToolkitFluxcdIoV2HelmRelease } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type HelmReleaseAttribute =
	| 'Name'
	| 'Namespace'
	| 'Repository'
	| 'Helm Chart'
	| 'Version'
	| 'Status'
	| 'Reason'
	| 'Age'
	| 'raw';

function getHelmReleaseDataSchemas(): Record<HelmReleaseAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Repository: 'text',
		'Helm Chart': 'text',
		Version: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getHelmReleaseData(
	object: HelmToolkitFluxcdIoV2HelmRelease
): Record<HelmReleaseAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition) => condition.type === 'Ready'
	);
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Repository: object?.spec?.chart?.spec?.sourceRef?.name ?? null,
		'Helm Chart': object?.status?.helmChart ?? null,
		Version: object?.spec?.chart?.spec?.version ?? null,
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

function getHelmReleaseUISchemas(): Record<HelmReleaseAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Repository: 'text',
		'Helm Chart': 'text',
		Version: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getHelmReleaseColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<HelmReleaseAttribute, UISchemaType>,
	dataSchemas: Record<HelmReleaseAttribute, DataSchemaType>
): ColumnDef<Record<HelmReleaseAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as HelmReleaseAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Repository',
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Repository'
		},
		{
			id: 'Helm Chart',
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Helm Chart'
		},
		{
			id: 'Version',
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Version'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Reason'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<HelmReleaseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<HelmReleaseAttribute, JsonValue>>;
				row: Row<Record<HelmReleaseAttribute, JsonValue>>;
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
	getHelmReleaseColumnDefinitions,
	getHelmReleaseData,
	getHelmReleaseDataSchemas,
	getHelmReleaseUISchemas
};

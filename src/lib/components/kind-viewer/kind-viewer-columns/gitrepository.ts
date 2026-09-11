import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { SourceToolkitFluxcdIoV1GitRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from '../utils';

type GitRepositoryAttribute =
	| 'Name'
	| 'Namespace'
	| 'URL'
	| 'Reference'
	| 'Interval'
	| 'Status'
	| 'Reason'
	| 'Age'
	| 'raw';

function getGitRepositoryDataSchemas(): Record<GitRepositoryAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		URL: 'text',
		Reference: 'text',
		Interval: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getGitRepositoryData(
	object: SourceToolkitFluxcdIoV1GitRepository
): Record<GitRepositoryAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition) => condition.type === 'Ready'
	);
	// Follows the checkout precedence of GitRepositoryRef: commit > name > semver > tag > branch.
	const reference =
		object?.spec?.ref?.commit ??
		object?.spec?.ref?.name ??
		object?.spec?.ref?.semver ??
		object?.spec?.ref?.tag ??
		object?.spec?.ref?.branch ??
		null;
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		URL: object?.spec?.url ?? null,
		Reference: reference,
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

function getGitRepositoryUISchemas(): Record<GitRepositoryAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		URL: 'text',
		Reference: 'text',
		Interval: 'text',
		Status: 'text',
		Reason: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getGitRepositoryColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<GitRepositoryAttribute, UISchemaType>,
	dataSchemas: Record<GitRepositoryAttribute, DataSchemaType>
): ColumnDef<Record<GitRepositoryAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as GitRepositoryAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
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
			id: 'URL',
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'URL'
		},
		{
			id: 'Reference',
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Reference'
		},
		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<GitRepositoryAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<GitRepositoryAttribute, JsonValue>>;
				row: Row<Record<GitRepositoryAttribute, JsonValue>>;
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
	getGitRepositoryColumnDefinitions,
	getGitRepositoryData,
	getGitRepositoryDataSchemas,
	getGitRepositoryUISchemas
};

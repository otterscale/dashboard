import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
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

type LLMInferenceServiceObject = {
	metadata?: {
		name?: string;
		namespace?: string;
		creationTimestamp?: string;
	};
	spec?: {
		model?: {
			name?: string;
			uri?: string;
		};
		replicas?: number;
		baseRefs?: { name?: string }[];
		prefill?: unknown;
	};
	status?: {
		url?: string;
		address?: { url?: string };
		conditions?: { type?: string; status?: string; reason?: string }[];
	};
};

type LLMInferenceServiceAttribute =
	| 'Name'
	| 'Namespace'
	| 'Model Name'
	| 'Model URI'
	| 'Templates'
	| 'Mode'
	| 'Status'
	| 'Age'
	| 'raw';

function getLLMInferenceServiceDataSchemas(): Record<LLMInferenceServiceAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Model Name': 'text',
		'Model URI': 'text',
		Templates: 'number',
		Mode: 'text',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLLMInferenceServiceData(
	object: LLMInferenceServiceObject
): Record<LLMInferenceServiceAttribute, JsonValue> {
	const readyCondition = object?.status?.conditions?.find(
		(condition) => condition.type === 'Ready'
	);
	const baseRefs = object?.spec?.baseRefs ?? [];
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Model Name': object?.spec?.model?.name ?? null,
		'Model URI': object?.spec?.model?.uri ?? null,
		Templates: baseRefs.length,
		Mode: object?.spec?.prefill ? 'Prefill/Decode' : 'Single',
		Status:
			readyCondition?.status === 'True'
				? 'Ready'
				: readyCondition?.status === 'False'
					? (readyCondition.reason ?? '')
					: '',
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getLLMInferenceServiceUISchemas(): Record<LLMInferenceServiceAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Model Name': 'text',
		'Model URI': 'text',
		Templates: 'array-of-object',
		Mode: 'text',
		Status: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLLMInferenceServiceColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<LLMInferenceServiceAttribute, UISchemaType>,
	dataSchemas: Record<LLMInferenceServiceAttribute, DataSchemaType>
): ColumnDef<Record<LLMInferenceServiceAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as LLMInferenceServiceAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		{
			id: 'Model Name',
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Model Name'
		},
		{
			id: 'Model URI',
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Model URI'
		},
		{
			id: 'Templates',
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: ((row.original.raw as LLMInferenceServiceObject)?.spec?.baseRefs ?? []).map(
							(ref) =>
								({
									title: ref?.name
								}) as ArrayOfObjectItemType
						)
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Templates'
		},
		{
			id: 'Mode',
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Mode'
		},

		{
			id: 'Status',
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
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
			header: ({ column }: { column: Column<Record<LLMInferenceServiceAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceAttribute, JsonValue>>;
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
	getLLMInferenceServiceColumnDefinitions,
	getLLMInferenceServiceData,
	getLLMInferenceServiceDataSchemas,
	getLLMInferenceServiceUISchemas
};

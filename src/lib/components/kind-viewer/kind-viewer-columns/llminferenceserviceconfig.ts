import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from '../utils';

type LLMInferenceServiceConfigObject = {
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
		template?: unknown;
		prefill?: unknown;
	};
};

type LLMInferenceServiceConfigAttribute =
	| 'Name'
	| 'Namespace'
	| 'Model Name'
	| 'Model URI'
	| 'Mode'
	| 'Age'
	| 'raw';

function getLLMInferenceServiceConfigDataSchemas(): Record<
	LLMInferenceServiceConfigAttribute,
	DataSchemaType
> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Model Name': 'text',
		'Model URI': 'text',
		Mode: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLLMInferenceServiceConfigData(
	object: LLMInferenceServiceConfigObject
): Record<LLMInferenceServiceConfigAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Model Name': object?.spec?.model?.name ?? null,
		'Model URI': object?.spec?.model?.uri ?? null,
		Mode: object?.spec?.prefill ? 'Prefill/Decode' : object?.spec?.template ? 'Single' : '',
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getLLMInferenceServiceConfigUISchemas(): Record<
	LLMInferenceServiceConfigAttribute,
	UISchemaType
> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Model Name': 'text',
		'Model URI': 'text',
		Mode: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLLMInferenceServiceConfigColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<LLMInferenceServiceConfigAttribute, UISchemaType>,
	dataSchemas: Record<LLMInferenceServiceConfigAttribute, DataSchemaType>
): ColumnDef<Record<LLMInferenceServiceConfigAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({
				column
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as LLMInferenceServiceConfigAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({
				column
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
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
			id: 'Model Name',
			header: ({
				column
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
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
			header: ({
				column
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Model URI'
		},
		{
			id: 'Mode',
			header: ({
				column
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Mode'
		},
		{
			id: 'Age',
			header: ({
				column
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
				row: Row<Record<LLMInferenceServiceConfigAttribute, JsonValue>>;
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
	getLLMInferenceServiceConfigColumnDefinitions,
	getLLMInferenceServiceConfigData,
	getLLMInferenceServiceConfigDataSchemas,
	getLLMInferenceServiceConfigUISchemas
};

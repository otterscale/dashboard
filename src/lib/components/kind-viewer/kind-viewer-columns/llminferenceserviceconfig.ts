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

import { buildResourceDetailUrl } from '../utils';

type LLMInferenceServiceConfigObject = {
	metadata?: {
		name?: string;
		namespace?: string;
		creationTimestamp?: string;
		annotations?: Record<string, string>;
	};
	spec?: {
		model?: {
			name?: string;
			uri?: string;
		};
	};
	status?: {
		conditions?: { type?: string; status?: string; reason?: string }[];
		referencedBy?: { name?: string; namespace?: string }[];
	};
};

type LLMInferenceServiceConfigAttribute =
	| 'Name'
	| 'Namespace'
	| 'Model Name'
	| 'Model URI'
	| 'Description'
	| 'Status'
	| 'Usage'
	| 'Referenced By'
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
		Description: 'text',
		Status: 'text',
		Usage: 'text',
		'Referenced By': 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getLLMInferenceServiceConfigData(
	object: LLMInferenceServiceConfigObject
): Record<LLMInferenceServiceConfigAttribute, JsonValue> {
	const conditions = object?.status?.conditions;
	const readyCondition = conditions?.find((condition) => condition.type === 'Ready');
	const inUseCondition = conditions?.find((condition) => condition.type === 'ConfigInUse');
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Model Name': object?.spec?.model?.name ?? null,
		'Model URI': object?.spec?.model?.uri ?? null,
		Description: object?.metadata?.annotations?.['template.phison.com/description']?.trim() || null,
		Status:
			readyCondition?.status === 'True'
				? 'Ready'
				: readyCondition?.status === 'False'
					? (readyCondition.reason ?? '')
					: '',
		Usage:
			inUseCondition?.status === 'True'
				? 'In Use'
				: inUseCondition?.status === 'False'
					? 'Not In Use'
					: '',
		'Referenced By': object?.status?.referencedBy?.length ?? 0,
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
		Description: 'text',
		Status: 'text',
		Usage: 'text',
		'Referenced By': 'array-of-object',
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
			id: 'Description',
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
			accessorKey: 'Description'
		},
		{
			id: 'Status',
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
			accessorKey: 'Status'
		},
		{
			id: 'Usage',
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
			accessorKey: 'Usage'
		},
		{
			id: 'Referenced By',
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
						items: (
							(row.original.raw as LLMInferenceServiceConfigObject)?.status?.referencedBy ?? []
						).map(
							(service) =>
								({
									title: service?.name ?? null,
									description: service?.namespace ?? null,
									raw: service as JsonObject
								}) satisfies ArrayOfObjectItemType
						)
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Referenced By'
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
	getLLMInferenceServiceConfigUISchemas,
	type LLMInferenceServiceConfigAttribute
};

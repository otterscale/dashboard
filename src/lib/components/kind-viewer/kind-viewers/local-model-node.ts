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

type LocalModelNodeObject = {
	metadata?: {
		name?: string;
		creationTimestamp?: string;
	};
	spec?: {
		localModels?: {
			modelName?: string;
			sourceModelUri?: string;
			namespace?: string;
			nodeGroup?: string;
			serviceAccountName?: string;
		}[];
	};
	status?: {
		modelStatus?: Record<string, string>;
	};
};

type LocalModelNodeAttribute = 'Name' | 'Local Models' | 'Models Ready' | 'Age' | 'raw';

function getLocalModelNodeDataSchemas(): Record<LocalModelNodeAttribute, DataSchemaType> {
	return {
		Name: 'text',
		'Local Models': 'number',
		'Models Ready': 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLocalModelNodeData(
	object: LocalModelNodeObject
): Record<LocalModelNodeAttribute, JsonValue> {
	const localModels = object?.spec?.localModels ?? [];
	const modelStatus = object?.status?.modelStatus ?? {};
	const downloaded = Object.values(modelStatus).filter(
		(status) => status === 'ModelDownloaded'
	).length;
	return {
		Name: object?.metadata?.name ?? null,
		'Local Models': localModels.length,
		'Models Ready': `${downloaded} / ${localModels.length}`,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getLocalModelNodeUISchemas(): Record<LocalModelNodeAttribute, UISchemaType> {
	return {
		Name: 'link',
		'Local Models': 'array-of-object',
		'Models Ready': 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLocalModelNodeColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<LocalModelNodeAttribute, UISchemaType>,
	dataSchemas: Record<LocalModelNodeAttribute, DataSchemaType>
): ColumnDef<Record<LocalModelNodeAttribute, JsonValue>>[] {
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<LocalModelNodeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelNodeAttribute, JsonValue>>;
				row: Row<Record<LocalModelNodeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as LocalModelNodeAttribute] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Local Models',
			header: ({ column }: { column: Column<Record<LocalModelNodeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelNodeAttribute, JsonValue>>;
				row: Row<Record<LocalModelNodeAttribute, JsonValue>>;
			}) => {
				const raw = row.original.raw as LocalModelNodeObject;
				const modelStatus = raw?.status?.modelStatus ?? {};
				return renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						items: (raw?.spec?.localModels ?? []).map(
							(model) =>
								({
									title: model?.modelName,
									description: model?.sourceModelUri,
									actions: model?.modelName ? modelStatus[model.modelName] : undefined
								}) as ArrayOfObjectItemType
						)
					} satisfies ArrayOfObjectMetadata
				});
			},
			accessorKey: 'Local Models'
		},
		{
			id: 'Models Ready',
			header: ({ column }: { column: Column<Record<LocalModelNodeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelNodeAttribute, JsonValue>>;
				row: Row<Record<LocalModelNodeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: 'Models Ready'
		},
		{
			id: 'Age',
			header: ({ column }: { column: Column<Record<LocalModelNodeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LocalModelNodeAttribute, JsonValue>>;
				row: Row<Record<LocalModelNodeAttribute, JsonValue>>;
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
	getLocalModelNodeColumnDefinitions,
	getLocalModelNodeData,
	getLocalModelNodeDataSchemas,
	getLocalModelNodeUISchemas
};

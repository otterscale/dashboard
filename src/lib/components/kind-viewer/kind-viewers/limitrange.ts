import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { CoreV1LimitRange } from '@otterscale/types';
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

// kubectl get limitrange
// NAME   NAMESPACE   CREATED AT
type LimitRangeAttribute = 'Namespace' | 'Name' | 'Limits' | 'Age' | 'raw';

function getLimitRangeDataSchemas(): Record<LimitRangeAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Limits: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getLimitRangeData(object: CoreV1LimitRange): Record<LimitRangeAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Limits: object?.spec?.limits?.length ?? 0,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getLimitRangeUISchemas(): Record<LimitRangeAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Limits: 'array-of-object',
		Age: 'time',
		raw: 'object'
	};
}

function getLimitRangeColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<LimitRangeAttribute, UISchemaType>,
	dataSchemas: Record<LimitRangeAttribute, DataSchemaType>
): ColumnDef<Record<LimitRangeAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: LimitRangeAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<LimitRangeAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<LimitRangeAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<LimitRangeAttribute, JsonValue>>;
			row: Row<Record<LimitRangeAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		simpleColumn('Namespace'),
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<LimitRangeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LimitRangeAttribute, JsonValue>>;
				row: Row<Record<LimitRangeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: resolve(
							`/(auth)/${page.params.cluster}/${page.params.workspace}/${row.original[column.id as LimitRangeAttribute]}?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}&namespaced=${apiResource.namespaced}`
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Limits',
			header: ({ column }: { column: Column<Record<LimitRangeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LimitRangeAttribute, JsonValue>>;
				row: Row<Record<LimitRangeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						items: ((row.original.raw as CoreV1LimitRange).spec?.limits ?? []).map((limit) => ({
							title: limit.type,
							description: Object.entries(limit.default ?? {})
								.map(([k, v]) => `${k}: ${v}`)
								.join(', '),
							raw: limit as JsonObject
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Limits',
			meta: { class: 'hidden xl:table-cell' }
		},
		simpleColumn('Age')
	];
}

export {
	getLimitRangeColumnDefinitions,
	getLimitRangeData,
	getLimitRangeDataSchemas,
	getLimitRangeUISchemas
};

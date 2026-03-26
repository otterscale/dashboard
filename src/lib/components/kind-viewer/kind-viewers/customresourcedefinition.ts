import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { ApiextensionsK8SIoV1CustomResourceDefinition } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import {
	type ArrayOfObjectItemsType,
	type ArrayOfObjectMetadata
} from '$lib/components/dynamic-table/dynamic-table-cells/array-of-object-cell.svelte';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

// kubectl get crd
// NAME   GROUP   KIND   SCOPE   VERSIONS   AGE
type CRDAttribute = 'Name' | 'Group' | 'Kind' | 'Scope' | 'Versions' | 'Age' | 'raw';

function getCRDDataSchemas(): Record<CRDAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Group: 'text',
		Kind: 'text',
		Scope: 'text',
		Versions: 'number',
		Age: 'time',
		raw: 'object'
	};
}

function getCRDData(
	object: ApiextensionsK8SIoV1CustomResourceDefinition
): Record<CRDAttribute, JsonValue> {
	const versions = (object?.spec?.versions ?? []).map((v) => v.name);

	return {
		Name: object?.metadata?.name ?? null,
		Group: object?.spec?.group ?? null,
		Kind: object?.spec?.names?.kind ?? null,
		Scope: object?.spec?.scope ?? null,
		Versions: versions.length,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getCRDUISchemas(): Record<CRDAttribute, UISchemaType> {
	return {
		Name: 'link',
		Group: 'text',
		Kind: 'text',
		Scope: 'text',
		Versions: 'array-of-object',
		Age: 'time',
		raw: 'object'
	};
}

function getCRDColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<CRDAttribute, UISchemaType>,
	dataSchemas: Record<CRDAttribute, DataSchemaType>
): ColumnDef<Record<CRDAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: CRDAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<CRDAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<CRDAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<CRDAttribute, JsonValue>>;
			row: Row<Record<CRDAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<CRDAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<CRDAttribute, JsonValue>>;
				row: Row<Record<CRDAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as CRDAttribute] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Group'),
		simpleColumn('Kind'),
		simpleColumn('Scope'),
		{
			id: 'Versions',
			header: ({ column }: { column: Column<Record<CRDAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<CRDAttribute, JsonValue>>;
				row: Row<Record<CRDAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						items: (
							(row.original.raw as ApiextensionsK8SIoV1CustomResourceDefinition).spec?.versions ??
							[]
						).map((v) => ({
							title: v.name,
							description: [
								v.served ? 'served' : null,
								v.storage ? 'storage' : null,
								v.deprecated ? 'deprecated' : null
							]
								.filter(Boolean)
								.join(', '),
							raw: { name: v.name, served: v.served, storage: v.storage } as JsonObject
						})) as ArrayOfObjectItemsType
					} satisfies ArrayOfObjectMetadata
				}),
			accessorKey: 'Versions',
			meta: { class: 'hidden xl:table-cell' }
		},
		simpleColumn('Age')
	];
}

export { getCRDColumnDefinitions, getCRDData, getCRDDataSchemas, getCRDUISchemas };

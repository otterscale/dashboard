import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

type ObjectBucketClaimAttribute =
	| 'Name'
	| 'Namespace'
	| 'Storage Class'
	| 'Bucket Name'
	| 'Bucket Owner'
	| 'Bucket Policy'
	| 'Phase'
	| 'Age'
	| 'raw';

function getObjectBucketClaimDataSchemas(): Record<ObjectBucketClaimAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		'Storage Class': 'text',
		'Bucket Name': 'text',
		'Bucket Owner': 'text',
		'Bucket Policy': 'text',
		Phase: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getObjectBucketClaimData(object: any): Record<ObjectBucketClaimAttribute, JsonValue> {
	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		'Storage Class': object?.spec?.storageClassName ?? null,
		'Bucket Name': object?.spec?.bucketName ?? null,
		'Bucket Owner': object?.spec?.additionalConfig?.bucketOwner ?? null,
		'Bucket Policy': object?.spec?.additionalConfig?.bucketPolicy ?? null,
		Phase: object?.status?.phase ?? null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getObjectBucketClaimUISchemas(): Record<ObjectBucketClaimAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		'Storage Class': 'text',
		'Bucket Name': 'text',
		'Bucket Owner': 'text',
		'Bucket Policy': 'text',
		Phase: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getObjectBucketClaimColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<ObjectBucketClaimAttribute, UISchemaType>,
	dataSchemas: Record<ObjectBucketClaimAttribute, DataSchemaType>
): ColumnDef<Record<ObjectBucketClaimAttribute, JsonValue>>[] {
	const columns: ObjectBucketClaimAttribute[] = [
		'Name',
		'Namespace',
		'Storage Class',
		'Bucket Name',
		'Bucket Owner',
		'Bucket Policy',
		'Phase',
		'Age'
	];
	return columns.map((id) => {
		if (id === 'Name') {
			return {
				id: 'Name',
				header: ({ column }: { column: Column<Record<ObjectBucketClaimAttribute, JsonValue>> }) =>
					renderComponent(DynamicTableHeader, { column, dataSchemas }),
				cell: ({
					column,
					row
				}: {
					column: Column<Record<ObjectBucketClaimAttribute, JsonValue>>;
					row: Row<Record<ObjectBucketClaimAttribute, JsonValue>>;
				}) =>
					renderComponent(DynamicTableCell, {
						row,
						column,
						uiSchemas,
						metadata: {
							hyperlink: buildResourceDetailUrl(
								apiResource,
								row.original[column.id as ObjectBucketClaimAttribute] as string,
								row.original['Namespace'] as string
							)
						} satisfies LinkMetadata
					}),
				accessorKey: 'Name'
			};
		} else {
			return {
				id,
				header: ({ column }: { column: Column<Record<ObjectBucketClaimAttribute, JsonValue>> }) =>
					renderComponent(DynamicTableHeader, {
						column,
						dataSchemas
					}),
				cell: ({
					column,
					row
				}: {
					column: Column<Record<ObjectBucketClaimAttribute, JsonValue>>;
					row: Row<Record<ObjectBucketClaimAttribute, JsonValue>>;
				}) =>
					renderComponent(DynamicTableCell, {
						row,
						column,
						uiSchemas
					}),
				accessorKey: id
			};
		}
	});
	const simpleColumn = (
		id: ObjectBucketClaimAttribute
	): ColumnDef<Record<ObjectBucketClaimAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<ObjectBucketClaimAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<ObjectBucketClaimAttribute, JsonValue>>;
			row: Row<Record<ObjectBucketClaimAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<ObjectBucketClaimAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ObjectBucketClaimAttribute, JsonValue>>;
				row: Row<Record<ObjectBucketClaimAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as ObjectBucketClaimAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		simpleColumn('Namespace'),
		simpleColumn('Storage Class'),
		simpleColumn('Bucket Name'),
		simpleColumn('Bucket Owner'),
		simpleColumn('Bucket Policy'),
		simpleColumn('Phase'),
		simpleColumn('Age')
	];
}

export {
	getObjectBucketClaimColumnDefinitions,
	getObjectBucketClaimData,
	getObjectBucketClaimDataSchemas,
	getObjectBucketClaimUISchemas
};

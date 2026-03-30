import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import { buildResourceDetailUrl } from './resource-url';

// kubectl get dv -o wide
// NAME   PHASE   PROGRESS   RESTARTS   AGE
type DataVolumeAttribute =
	| 'Name'
	| 'Namespace'
	| 'Phase'
	| 'Progress'
	| 'Storage'
	| 'Source'
	| 'Access Modes'
	| 'Age'
	| 'raw';

function getDataVolumeDataSchemas(): Record<DataVolumeAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Namespace: 'text',
		Phase: 'text',
		Progress: 'text',
		Storage: 'text',
		Source: 'text',
		'Access Modes': 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getDataVolumeData(object: any): Record<DataVolumeAttribute, JsonValue> {
	// Determine source type from spec.source
	const source = object?.spec?.source;
	let sourceDisplay: string | null = null;
	if (source) {
		const sourceType = Object.keys(source).find(
			(k) => source[k] && Object.keys(source[k]).length >= 0
		);
		if (sourceType) {
			const details = source[sourceType];
			if (sourceType === 'http' || sourceType === 's3' || sourceType === 'gcs') {
				sourceDisplay = `${sourceType}: ${details?.url ?? ''}`;
			} else if (sourceType === 'registry') {
				sourceDisplay = `registry: ${details?.url ?? details?.imageStream ?? ''}`;
			} else if (sourceType === 'pvc') {
				sourceDisplay = `pvc: ${details?.namespace ?? ''}/${details?.name ?? ''}`;
			} else if (sourceType === 'snapshot') {
				sourceDisplay = `snapshot: ${details?.namespace ?? ''}/${details?.name ?? ''}`;
			} else {
				sourceDisplay = sourceType;
			}
		}
	} else if (object?.spec?.sourceRef) {
		sourceDisplay = `ref: ${object.spec.sourceRef.kind}/${object.spec.sourceRef.name}`;
	}

	// Storage size from spec.pvc or spec.storage
	const storage =
		object?.spec?.pvc?.resources?.requests?.storage ??
		object?.spec?.storage?.resources?.requests?.storage ??
		null;

	// Access modes from spec.pvc or spec.storage
	const accessModes = object?.spec?.pvc?.accessModes ?? object?.spec?.storage?.accessModes ?? null;
	const accessModesDisplay = Array.isArray(accessModes) ? accessModes.join(', ') : null;

	return {
		Name: object?.metadata?.name ?? null,
		Namespace: object?.metadata?.namespace ?? null,
		Phase: object?.status?.phase ?? null,
		Progress: object?.status?.progress ?? null,
		Storage: storage,
		Source: sourceDisplay,
		'Access Modes': accessModesDisplay,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getDataVolumeUISchemas(): Record<DataVolumeAttribute, UISchemaType> {
	return {
		Name: 'link',
		Namespace: 'text',
		Phase: 'text',
		Progress: 'text',
		Storage: 'text',
		Source: 'text',
		'Access Modes': 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getDataVolumeColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<DataVolumeAttribute, UISchemaType>,
	dataSchemas: Record<DataVolumeAttribute, DataSchemaType>
): ColumnDef<Record<DataVolumeAttribute, JsonValue>>[] {
	const simpleColumn = (
		id: DataVolumeAttribute,
		meta?: Record<string, string>
	): ColumnDef<Record<DataVolumeAttribute, JsonValue>> => ({
		id,
		header: ({ column }: { column: Column<Record<DataVolumeAttribute, JsonValue>> }) =>
			renderComponent(DynamicTableHeader, { column, dataSchemas }),
		cell: ({
			column,
			row
		}: {
			column: Column<Record<DataVolumeAttribute, JsonValue>>;
			row: Row<Record<DataVolumeAttribute, JsonValue>>;
		}) => renderComponent(DynamicTableCell, { row, column, uiSchemas }),
		accessorKey: id,
		...(meta ? { meta } : {})
	});

	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<DataVolumeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DataVolumeAttribute, JsonValue>>;
				row: Row<Record<DataVolumeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as DataVolumeAttribute] as string,
							row.original['Namespace'] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		{
			id: 'Namespace',
			header: ({ column }: { column: Column<Record<DataVolumeAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, { column, dataSchemas }),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<DataVolumeAttribute, JsonValue>>;
				row: Row<Record<DataVolumeAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas
				}),
			accessorKey: 'Namespace'
		},
		simpleColumn('Phase'),
		simpleColumn('Progress'),
		simpleColumn('Storage'),
		simpleColumn('Source', { class: 'hidden lg:table-cell' }),
		simpleColumn('Access Modes', { class: 'hidden xl:table-cell' }),
		simpleColumn('Age')
	];
}

export {
	getDataVolumeColumnDefinitions,
	getDataVolumeData,
	getDataVolumeDataSchemas,
	getDataVolumeUISchemas
};

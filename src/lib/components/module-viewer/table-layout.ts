import { type JsonValue } from '@bufbuild/protobuf';
import type { SourceToolkitFluxcdIoV1HelmRepository } from '@otterscale/types';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { renderComponent } from '$lib/components/ui/data-table';

import type { ModuleType } from './types';

type ModuleAttribute =
	| 'Helm Repository'
	| 'Chart Name'
	| 'Description'
	| 'Digest'
	| 'Version'
	| 'Type'
	| 'Labels'
	| 'Installed'
	| 'annotations'
	| 'installable'
	| 'icon'
	| 'helmRepository'
	| 'chart'
	| 'installedModules'
	| 'sourceType';

function getChartDataSchemas(): Record<ModuleAttribute, DataSchemaType> {
	return {
		'Helm Repository': 'text',
		'Chart Name': 'text',
		Description: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Labels: 'array',
		Installed: 'boolean',
		annotations: 'object',
		installable: 'boolean',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object',
		installedModules: 'array',
		sourceType: 'text'
	};
}

function getChartUISchemas(): Record<ModuleAttribute, UISchemaType> {
	return {
		'Helm Repository': 'text',
		'Chart Name': 'text',
		Description: 'text',
		Digest: 'text',
		Version: 'text',
		Type: 'text',
		Labels: 'array',
		Installed: 'boolean',
		annotations: 'object',
		installable: 'boolean',
		icon: 'text',
		helmRepository: 'object',
		chart: 'object',
		installedModules: 'array',
		sourceType: 'text'
	};
}
function getChartData(
	module: ModuleType,
	installedModuleNames: Set<string>,
	helmRepository: SourceToolkitFluxcdIoV1HelmRepository
): Record<ModuleAttribute, JsonValue> {
	const dependsOn = module.annotations?.['module.otterscale.io/depends-on'] ?? '';
	const prerequisite = dependsOn.split(',').filter(Boolean);
	return {
		'Helm Repository': helmRepository.metadata?.name ?? null,
		'Chart Name': module.name ?? null,
		Description: module.description as JsonValue,
		Digest: module.digest ?? null,
		Version: module.version as JsonValue,
		Type: module.type ?? null,
		Labels: (module.keywords ?? []) as JsonValue,
		Installed: installedModuleNames.has(module.name ?? ''),
		installable: prerequisite?.every((prerequisite) =>
			installedModuleNames.has(prerequisite)
		) as JsonValue,
		annotations: module?.annotations as JsonValue,
		icon: module.icon as JsonValue,
		helmRepository: helmRepository as JsonValue,
		chart: module as unknown as JsonValue,
		installedModules: Array.from(installedModuleNames) as unknown as JsonValue,
		sourceType: 'index'
	};
}

function getChartColumnDefinitions(
	uiSchemas: Record<ModuleAttribute, UISchemaType>,
	dataSchemas: Record<ModuleAttribute, DataSchemaType>
): ColumnDef<Record<ModuleAttribute, JsonValue>>[] {
	const columns: ModuleAttribute[] = [
		'Chart Name',
		'Description',
		'Digest',
		'Type',
		'Version',
		'Labels',
		'Installed'
	];

	return columns.map((id) => {
		return {
			id,
			header: ({ column }: { column: Column<Record<ModuleAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column,
					dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<ModuleAttribute, JsonValue>>;
				row: Row<Record<ModuleAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row,
					column,
					uiSchemas
				}),
			accessorKey: id
		};
	});
}

export {
	getChartColumnDefinitions,
	getChartData,
	getChartDataSchemas,
	getChartUISchemas,
	type ModuleAttribute
};

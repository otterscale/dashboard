import { type JsonObject, type JsonValue } from '@bufbuild/protobuf';
import { getLocalTimeZone } from '@internationalized/date';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { Column, ColumnDef } from '@tanstack/table-core';
import { type Row } from '@tanstack/table-core';

import { DynamicTableCell, DynamicTableHeader } from '$lib/components/dynamic-table';
import type { LinkMetadata } from '$lib/components/dynamic-table/dynamic-table-cells/link-cell.svelte';
import { type DataSchemaType, type UISchemaType } from '$lib/components/dynamic-table/utils';
import { buildResourceDetailUrl } from '$lib/components/kind-viewer/utils';
import { decodeTokenPayload, getLicenseExpiry } from '$lib/components/license/token';
import { renderComponent } from '$lib/components/ui/data-table';
import { getLocale } from '$lib/paraglide/runtime';

// Minimal shape of license.otterscale.io/v1alpha1 License; the authoritative
// definition lives in license-operator api/v1alpha1/license_types.go.
interface LicenseResource {
	metadata?: { name?: string; creationTimestamp?: string };
	spec?: { token?: string };
	status?: {
		phase?: string;
		softwareID?: string;
		isPlatform?: boolean;
		clusterFingerprintOK?: boolean;
		nodeCount?: number;
		maxNodes?: number;
		authorizedNodeCount?: number;
		conditions?: { type: string; status: string; reason?: string; message?: string }[];
	};
}

// Conditions whose True value indicates an anomaly the user must act on.
const ALERT_CONDITIONS = ['EnforcementFrozen', 'PlatformAliasConflict'];

type LicenseAttribute =
	| 'Name'
	| 'Software'
	| 'Platform'
	| 'Phase'
	| 'Expiry'
	| 'Alerts'
	| 'Age'
	| 'raw';

function getLicenseDataSchemas(): Record<LicenseAttribute, DataSchemaType> {
	return {
		Name: 'text',
		Software: 'text',
		Platform: 'boolean',
		Phase: 'text',
		Expiry: 'time',
		Alerts: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLicenseData(object: LicenseResource): Record<LicenseAttribute, JsonValue> {
	const status = object?.status ?? {};
	const expiry = getLicenseExpiry(decodeTokenPayload(object?.spec?.token ?? ''));
	const alerts = (status.conditions ?? [])
		.filter((condition) => ALERT_CONDITIONS.includes(condition.type) && condition.status === 'True')
		.map((condition) => condition.type);
	return {
		Name: object?.metadata?.name ?? null,
		Software: status.softwareID ?? null,
		Platform: status.isPlatform ?? false,
		Phase: status.phase ?? null,
		Expiry: expiry ? expiry.toLocaleDateString(getLocale()) : null,
		Alerts: alerts.length > 0 ? alerts.join(', ') : null,
		Age: object?.metadata?.creationTimestamp ?? null,
		raw: (object as JsonObject) ?? null
	};
}

function getLicenseUISchemas(): Record<LicenseAttribute, UISchemaType> {
	return {
		Name: 'link',
		Software: 'text',
		Platform: 'boolean',
		Phase: 'text',
		Expiry: 'text',
		Alerts: 'text',
		Age: 'time',
		raw: 'object'
	};
}

function getLicenseColumnDefinitions(
	apiResource: APIResource,
	uiSchemas: Record<LicenseAttribute, UISchemaType>,
	dataSchemas: Record<LicenseAttribute, DataSchemaType>
): ColumnDef<Record<LicenseAttribute, JsonValue>>[] {
	const attributes: LicenseAttribute[] = [
		'Software',
		'Platform',
		'Phase',
		'Expiry',
		'Alerts',
		'Age'
	];
	return [
		{
			id: 'Name',
			header: ({ column }: { column: Column<Record<LicenseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LicenseAttribute, JsonValue>>;
				row: Row<Record<LicenseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas,
					metadata: {
						hyperlink: buildResourceDetailUrl(
							apiResource,
							row.original[column.id as LicenseAttribute] as string
						)
					} satisfies LinkMetadata
				}),
			accessorKey: 'Name'
		},
		...attributes.map((attribute) => ({
			id: attribute,
			header: ({ column }: { column: Column<Record<LicenseAttribute, JsonValue>> }) =>
				renderComponent(DynamicTableHeader, {
					column: column,
					dataSchemas: dataSchemas
				}),
			cell: ({
				column,
				row
			}: {
				column: Column<Record<LicenseAttribute, JsonValue>>;
				row: Row<Record<LicenseAttribute, JsonValue>>;
			}) =>
				renderComponent(DynamicTableCell, {
					row: row,
					column: column,
					uiSchemas: uiSchemas
				}),
			accessorKey: attribute
		}))
	];
}

export { getLicenseColumnDefinitions, getLicenseData, getLicenseDataSchemas, getLicenseUISchemas };

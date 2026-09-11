import type { JsonObject, JsonValue } from '@bufbuild/protobuf';
import type { APIResource } from '@otterscale/api/resource/v1';
import type { ColumnDef } from '@tanstack/table-core';

import type { DataSchemaType, UISchemaType } from '$lib/components/dynamic-table/utils';

import type { ActionsType, CreateType } from './kind-viewer-actions';

/**
 * Extra handling for a resource kind the built-in switches do not cover.
 * Kinds are identified by group AND kind, since kind names alone are not
 * unique across API groups.
 */
export type KindExtension = {
	/** The kind is inspect-only: no create and no bulk delete are offered. */
	readOnly?: boolean;
	Create?: CreateType;
	Actions?: ActionsType;
	getData?: (object: JsonObject) => Record<string, JsonValue>;
	getDataSchemas?: () => Record<string, DataSchemaType>;
	getUISchemas?: () => Record<string, UISchemaType>;
	getColumnDefinitions?: (
		apiResource: APIResource,
		uiSchemas: Record<string, UISchemaType>,
		dataSchemas: Record<string, DataSchemaType>,
		cluster?: string
	) => ColumnDef<Record<string, JsonValue>>[];
};

// Edition seam — the enterprise edition overlays this file (ee/src) with a
// registry of extra kinds; the community edition has none.
export function getKindExtension(
	group: string | undefined,
	kind: string
): KindExtension | undefined {
	void group;
	void kind;
	return undefined;
}

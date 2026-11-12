import type { APIResource } from '@otterscale/api/resource/v1';

import { resolve } from '$app/paths';
import { page } from '$app/state';

/**
 * Build the URL for navigating to a resource's detail page.
 */
export function buildResourceDetailUrl(
	apiResource: APIResource,
	name: string,
	namespace?: string
): string {
	let query = `?group=${apiResource.group}&version=${apiResource.version}&kind=${apiResource.kind}&resource=${apiResource.resource}`;
	if (apiResource.namespaced) {
		query += `&namespace=${namespace}`;
	}
	return resolve(`/(auth)/${page.params.cluster}/${page.params.workspace}/${name}${query}`);
}

export type Condition = { type?: string; status?: string; reason?: string };

export function summarizeConditions(conditions: Condition[] = [], types: string[]): string {
	for (const type of types) {
		const failed = conditions.find((c) => c.type === type && c.status === 'False');
		if (failed) return failed.reason ?? type;
	}
	for (const type of [...types].reverse()) {
		if (conditions.some((c) => c.type === type && c.status === 'True')) return type;
	}
	return '';
}

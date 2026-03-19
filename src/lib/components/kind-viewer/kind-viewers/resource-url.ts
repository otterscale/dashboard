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

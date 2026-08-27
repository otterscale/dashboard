import { resolve } from '$app/paths';
import { page } from '$app/state';

/** A local timestamp, or an em dash when there is nothing to show. */
export function formatTimestamp(value: string): string {
	return value ? new Date(value).toLocaleString('sv-SE') : '';
}

/**
 * A link to another resource's viewer page, in the current cluster and
 * workspace. The target's full identity goes into the search params because the
 * page rebuilds the resource from them rather than looking anything up.
 */
export function getResourceURL(target: {
	group: string;
	version: string;
	kind: string;
	resource: string;
	name: string;
	namespace?: string;
}): string {
	const searchParameters = new URLSearchParams({
		group: target.group,
		version: target.version,
		kind: target.kind,
		resource: target.resource,
		...(target.namespace ? { namespace: target.namespace } : {}),
		query: `Name:${target.name}`
	});
	return resolve(`/(auth)/${page.params.cluster}/${page.params.workspace}?${searchParameters}`);
}

import { resolve } from '$app/paths';
import { page } from '$app/state';

export function formatTimestamp(value: string): string {
	return value ? new Date(value).toLocaleString('sv-SE') : '';
}

export function getResourceURL(parameters: {
	group: string;
	version: string;
	kind: string;
	resource: string;
	name: string;
	namespace?: string;
	uid: string;
}): string {
	const searchParameters = new URLSearchParams({
		group: parameters.group,
		version: parameters.version,
		kind: parameters.kind,
		resource: parameters.resource,
		...(parameters.namespace ? { namespace: parameters.namespace } : {}),
		query: `raw.metadata.uid:${parameters.uid}`
	});
	return resolve(`/(auth)/${page.params.cluster}/${page.params.workspace}?${searchParameters}`);
}

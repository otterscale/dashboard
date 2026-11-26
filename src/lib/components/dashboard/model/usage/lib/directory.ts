import {
	type ApiKeyObject,
	createdBy,
	type ResourceClient
} from '$lib/components/api-keys/service';

import type { ApiKeyInfo, Directory } from './usage';

type WorkspaceObject = {
	metadata?: { name?: string };
	spec?: {
		namespace?: string;
		members?: { subject?: string; name?: string }[];
	};
};

const WORKSPACES = { group: 'tenant.otterscale.io', version: 'v1alpha1', resource: 'workspaces' };
const API_KEYS = { group: 'maas.phison.com', version: 'v1alpha1', resource: 'apikeys' };

function addWorkspace(dir: Directory, object: WorkspaceObject | undefined) {
	const name = object?.metadata?.name;
	const namespace = object?.spec?.namespace;
	if (name && namespace) dir.workspaces.set(namespace, name);
	for (const member of object?.spec?.members ?? []) {
		if (member.subject && member.name && !dir.people.has(member.subject)) {
			dir.people.set(member.subject, member.name);
		}
	}
}

/**
 * Workspaces (for names and member display names) and ApiKeys (for who made each key).
 *
 * A cluster admin lists both everywhere. A member reads their own Workspace and the ApiKeys in its
 * namespace. Each half fails on its own: without Workspaces people show as short IDs, without
 * ApiKeys `keys` is `null` and the page drops the Users view.
 */
export async function loadDirectory(
	client: ResourceClient,
	options: { cluster: string; everywhere: boolean; workspace: string; namespace: string }
): Promise<Directory> {
	const dir: Directory = { keys: null, workspaces: new Map(), people: new Map() };
	const { cluster } = options;

	const workspaces = (async () => {
		if (options.everywhere) {
			const response = await client.list({ cluster, ...WORKSPACES, namespace: '' });
			for (const item of response.items) addWorkspace(dir, item.object as WorkspaceObject);
		} else if (options.workspace) {
			const response = await client.get({
				cluster,
				...WORKSPACES,
				namespace: '',
				name: options.workspace
			});
			addWorkspace(dir, response.object as WorkspaceObject);
		}
	})().catch((error) => console.warn('Usage: failed to read Workspaces:', error));

	const keys = (async () => {
		const namespace = options.everywhere ? '' : options.namespace;
		if (!options.everywhere && !namespace) return;
		const response = await client.list({ cluster, ...API_KEYS, namespace });
		const map = new Map<string, ApiKeyInfo>();
		for (const item of response.items) {
			const key = item.object as unknown as ApiKeyObject | undefined;
			const name = key?.metadata?.name;
			const ns = key?.metadata?.namespace;
			if (!key || !name || !ns) continue;
			map.set(`${ns}.${name}`, {
				namespace: ns,
				name,
				createdBy: createdBy(key),
				created: key.metadata.creationTimestamp
			});
		}
		dir.keys = map;
	})().catch((error) => console.warn('Usage: failed to read ApiKeys:', error));

	await Promise.all([workspaces, keys]);
	return dir;
}

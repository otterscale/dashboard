import { type Client, Code, ConnectError } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';

// Reading Kubernetes objects through the Resource API, for the cards that show what Prometheus
// does not know (entry points, platform checks). The objects come back untyped, so fields are
// read by path.

export type KubeObject = Record<string, unknown>;

export function field(object: unknown, ...path: string[]): unknown {
	let current = object;
	for (const key of path) {
		if (typeof current !== 'object' || current === null) return undefined;
		current = (current as Record<string, unknown>)[key];
	}
	return current;
}

export function text(object: unknown, ...path: string[]): string | undefined {
	const value = field(object, ...path);
	return typeof value === 'string' && value ? value : undefined;
}

export function list(object: unknown, ...path: string[]): unknown[] {
	const value = field(object, ...path);
	return Array.isArray(value) ? value : [];
}

/**
 * Why a read did not answer. `denied`: this user may not read it, and will not be able to on the
 * next try either. `missing`: the cluster does not have the resource type. `failed`: anything
 * else (network, timeout), which the next poll may well get past.
 */
export type ReadFailure = 'denied' | 'missing' | 'failed';

export function readFailure(error: unknown): ReadFailure {
	const code = ConnectError.from(error).code;
	if (code === Code.PermissionDenied || code === Code.Unauthenticated) return 'denied';
	return code === Code.NotFound ? 'missing' : 'failed';
}

export type ListParams = {
	group: string;
	version: string;
	resource: string;
	namespace: string;
	labelSelector?: string;
};

export async function listObjects(
	client: Client<typeof ResourceService>,
	cluster: string,
	params: ListParams
): Promise<KubeObject[] | ReadFailure> {
	try {
		const response = await client.list({ cluster, ...params });
		return response.items.map((item) => (item.object ?? {}) as KubeObject);
	} catch (error) {
		return readFailure(error);
	}
}

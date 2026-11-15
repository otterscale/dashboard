import type { Client } from '@connectrpc/connect';
import { ConnectError } from '@connectrpc/connect';
import type { ResourceService } from '@otterscale/api/resource/v1';

import { m } from '$lib/messages';

import { PUBLIC_KEY_FORMAT } from './crypto';

export type ResourceClient = Client<typeof ResourceService>;

const API_KEY_GROUP = 'maas.phison.com';
const API_KEY_VERSION = 'v1alpha1';
const API_KEY_RESOURCE = 'apikeys';
const ANNOTATION_CREATED_BY = 'maas.phison.com/created-by';

export type ApiKeyCondition = {
	type: string;
	status: string;
	reason?: string;
	message?: string;
	observedGeneration?: number;
};

export type ApiKeyObject = {
	apiVersion?: string;
	kind?: string;
	metadata: {
		name: string;
		namespace?: string;
		resourceVersion?: string;
		creationTimestamp?: string;
		annotations?: Record<string, string>;
		[key: string]: unknown;
	};
	spec: {
		rotation: {
			generation: number;
			publicKey: string;
			publicKeyFormat: string;
		};
	};
	status?: {
		clientId?: string;
		keyPrefix?: string;
		keyGeneration?: number;
		encryptedKey?: string;
		lastRotatedAt?: string;
		conditions?: ApiKeyCondition[];
	};
};

export function createdBy(apiKey: ApiKeyObject): string {
	return apiKey.metadata.annotations?.[ANNOTATION_CREATED_BY] ?? '';
}

export function readyCondition(apiKey: ApiKeyObject): ApiKeyCondition | undefined {
	return apiKey.status?.conditions?.find((condition) => condition.type === 'Ready');
}

function gvr(namespace: string) {
	return {
		group: API_KEY_GROUP,
		version: API_KEY_VERSION,
		resource: API_KEY_RESOURCE,
		namespace
	};
}

function encodeManifest(manifest: unknown): Uint8Array {
	return new TextEncoder().encode(JSON.stringify(manifest));
}

const usernameCache = new Map<string, Promise<string>>();

export function fetchKubernetesUsername(client: ResourceClient, cluster: string): Promise<string> {
	let cached = usernameCache.get(cluster);
	if (!cached) {
		cached = requestKubernetesUsername(client, cluster);
		// Don't cache failures.
		cached.catch(() => usernameCache.delete(cluster));
		usernameCache.set(cluster, cached);
	}
	return cached;
}

async function requestKubernetesUsername(client: ResourceClient, cluster: string): Promise<string> {
	const response = await client.create({
		cluster,
		group: 'authentication.k8s.io',
		version: 'v1',
		resource: 'selfsubjectreviews',
		namespace: '',
		manifest: encodeManifest({
			apiVersion: 'authentication.k8s.io/v1',
			kind: 'SelfSubjectReview'
		})
	});
	const object = response.object as { status?: { userInfo?: { username?: string } } } | undefined;
	const username = object?.status?.userInfo?.username;
	if (!username) throw new Error('SelfSubjectReview returned no username');
	return username;
}

export async function getApiKey(
	client: ResourceClient,
	cluster: string,
	namespace: string,
	name: string
): Promise<ApiKeyObject> {
	const response = await client.get({ cluster, ...gvr(namespace), name });
	return response.object as unknown as ApiKeyObject;
}

export async function createApiKey(
	client: ResourceClient,
	options: {
		cluster: string;
		namespace: string;
		name: string;
		username: string;
		publicKey: string;
	}
): Promise<ApiKeyObject> {
	const response = await client.create({
		cluster: options.cluster,
		...gvr(options.namespace),
		manifest: encodeManifest({
			apiVersion: `${API_KEY_GROUP}/${API_KEY_VERSION}`,
			kind: 'ApiKey',
			metadata: {
				name: options.name,
				namespace: options.namespace,
				annotations: { [ANNOTATION_CREATED_BY]: options.username }
			},
			spec: {
				rotation: {
					generation: 1,
					publicKey: options.publicKey,
					publicKeyFormat: PUBLIC_KEY_FORMAT
				}
			}
		})
	});
	return response.object as unknown as ApiKeyObject;
}

// Carries the current resourceVersion, so a concurrent rotation fails with a conflict.
export async function rotateApiKey(
	client: ResourceClient,
	options: {
		cluster: string;
		namespace: string;
		name: string;
		publicKey: string;
	}
): Promise<{ apiKey: ApiKeyObject; generation: number }> {
	const current = await getApiKey(client, options.cluster, options.namespace, options.name);
	const generation = Number(current.spec.rotation.generation) + 1;

	// created-by is immutable, so metadata must be kept; status is never sent.
	const manifest: ApiKeyObject = {
		apiVersion: `${API_KEY_GROUP}/${API_KEY_VERSION}`,
		kind: 'ApiKey',
		metadata: { ...current.metadata },
		spec: {
			rotation: {
				generation,
				publicKey: options.publicKey,
				publicKeyFormat: PUBLIC_KEY_FORMAT
			}
		}
	};
	delete manifest.metadata.managedFields;

	const response = await client.update({
		cluster: options.cluster,
		...gvr(options.namespace),
		name: options.name,
		manifest: encodeManifest(manifest),
		fieldManager: 'otterscale-web-ui'
	});
	return { apiKey: response.object as unknown as ApiKeyObject, generation };
}

export async function waitForIssuedKey(
	client: ResourceClient,
	options: {
		cluster: string;
		namespace: string;
		name: string;
		generation: number;
		timeoutMs?: number;
		signal?: AbortSignal;
	}
): Promise<ApiKeyObject> {
	const timeoutMs = options.timeoutMs ?? 60_000;
	const deadline = Date.now() + timeoutMs;

	for (;;) {
		if (options.signal?.aborted) throw new Error('aborted');

		const apiKey = await getApiKey(client, options.cluster, options.namespace, options.name);
		const ready = readyCondition(apiKey);
		const keyGeneration = Number(apiKey.status?.keyGeneration ?? 0);

		if (keyGeneration === options.generation) {
			if (ready?.status === 'True' && apiKey.status?.encryptedKey) return apiKey;
		}
		// The operator reports failures for the generation it just observed.
		if (
			ready?.status === 'False' &&
			Number(ready.observedGeneration ?? 0) >= options.generation &&
			keyGeneration !== options.generation
		) {
			throw new Error(ready.message || ready.reason || 'key was not issued');
		}

		if (Date.now() >= deadline) {
			throw new Error(m.api_key_wait_timeout());
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
}

export function describeApiKeyError(error: unknown): string {
	const message = error instanceof ConnectError ? error.rawMessage : String(error);

	if (message.includes('only the creator of this ApiKey or a tenant admin')) {
		return m.api_key_error_not_owner();
	}
	if (message.includes('created-by must be set to the requesting user')) {
		return m.api_key_error_created_by();
	}
	if (/already exists/i.test(message)) {
		return m.api_key_error_name_exists();
	}
	if (/conflict|the object has been modified/i.test(message)) {
		return m.api_key_error_conflict();
	}
	if (/forbidden|permission/i.test(message)) {
		return m.api_key_error_forbidden();
	}
	if (/DNS label|63 characters/.test(message)) {
		return m.api_key_name_rule();
	}
	return message;
}

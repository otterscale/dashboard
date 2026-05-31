const LICENSE_NAME = 'otterscale-license';

interface LicenseCondition {
	type?: string;
	status?: string; // 'True' | 'False' | 'Unknown'
}

interface LicenseObject {
	status?: {
		phase?: string;
		conditions?: LicenseCondition[];
	};
}

interface GetResponse {
	object?: LicenseObject;
}

// A license counts as valid when a Valid/Ready condition is "True", or — when no
// such condition is present — when the phase reports an active state. Adjust
// these names to match the license.otterscale.io/v1alpha1 CRD if they differ.
const VALID_CONDITION_TYPES = new Set(['Valid', 'Ready']);
const VALID_PHASES = new Set(['Active', 'Valid']);

function isLicenseValid(license: LicenseObject | null): boolean {
	const status = license?.status;
	if (!status) return false;

	const condition = status.conditions?.find((c) => c.type && VALID_CONDITION_TYPES.has(c.type));
	if (condition) return condition.status === 'True';

	return status.phase ? VALID_PHASES.has(status.phase) : false;
}



async function fetchLicense(
	fetch: typeof globalThis.fetch,
	cluster: string
): Promise<LicenseObject | null> {
	const res = await fetch('/otterscale.resource.v1.ResourceService/Get', {
		method: 'POST',
		headers: {
			'x-proxy-target': 'api',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			cluster,
			group: 'license.otterscale.io',
			version: 'v1alpha1',
			resource: 'licenses',
			name: LICENSE_NAME
		})
	});

	// Connect maps a missing resource to HTTP 404 / code "not_found".
	if (res.status === 404) return null;
	if (!res.ok) {
		throw new Error(`Failed to fetch license: ${res.status} ${res.statusText}`);
	}

	const { object } = (await res.json()) as GetResponse;
	return object ?? null;
}

/**
 * Restricted mode is driven by the cluster's license: a missing or invalid
 * license restricts the deployment, a valid one unlocks it.
 */
export async function getIsRestricted(
	fetch: typeof globalThis.fetch,
	cluster: string | undefined
): Promise<boolean> {
	// No cluster in scope (e.g. login/console routes) — nothing to check against,
	// so don't restrict here; cluster-scoped routes re-evaluate with their cluster.
	if (!cluster) return false;

	try {
		const license = await fetchLicense(fetch, cluster);
		return !isLicenseValid(license);
	} catch (e) {
		// Fail open: a transient API error shouldn't lock users out of the app.
		console.error('Failed to determine license mode:', e);
		return false;
	}
}

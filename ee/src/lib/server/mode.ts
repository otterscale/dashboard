const LICENSE_NAME = 'license-hci';

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

const VALID_PHASES = new Set(['Provisional', 'Active']);

function isLicenseValid(license: LicenseObject | null): boolean {
	if (!license) return false;

	const status = license?.status;
	if (!status) return false;

	return status.phase ? VALID_PHASES.has(status.phase) : false;
}

async function fetchLicense(
	fetch: typeof globalThis.fetch,
	cluster: string
): Promise<LicenseObject | null> {
	const response = await fetch('/otterscale.resource.v1.ResourceService/Get', {
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

	if (response.status === 404) return null;
	if (!response.ok) {
		throw new Error(`Failed to fetch license: ${response.status} ${response.statusText}`);
	}

	const { object } = (await response.json()) as GetResponse;
	return object ?? null;
}

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
		console.error('Failed to determine license mode:', e);
		return false;
	}
}

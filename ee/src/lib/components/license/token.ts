// Helpers for reading a license JWT payload WITHOUT verifying its signature.
// The dashboard only decodes the payload to derive the CR name and display
// metadata; all validation/enforcement is done by the license operator.

export type LicenseTokenPayload = Record<string, unknown>;

export function decodeTokenPayload(token: string): LicenseTokenPayload | null {
	try {
		const [, payload] = token.split('.');
		if (!payload) return null;
		const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
		const parsed = JSON.parse(decoded);
		return typeof parsed === 'object' && parsed !== null ? (parsed as LicenseTokenPayload) : null;
	} catch {
		return null;
	}
}

// One license = one software: the payload `software` map must contain exactly
// one key, which is the software-id. Returns null on any other shape.
export function getSoftwareID(payload: LicenseTokenPayload | null): string | null {
	const software = payload?.software;
	if (!software || typeof software !== 'object' || Array.isArray(software)) return null;
	const keys = Object.keys(software);
	return keys.length === 1 ? keys[0] : null;
}

// The CR name the operator expects; any other name is marked Invalid.
export function licenseResourceName(softwareID: string): string {
	return `license-${softwareID}`;
}

// Effective expiry is software.<id>.exp (null = perpetual); the envelope exp
// is informational only and used as a fallback for display.
export function getLicenseExpiry(payload: LicenseTokenPayload | null): Date | null {
	if (!payload) return null;
	const softwareID = getSoftwareID(payload);
	if (softwareID) {
		const entry = (payload.software as Record<string, unknown>)[softwareID];
		if (entry && typeof entry === 'object') {
			const exp = (entry as Record<string, unknown>).exp;
			if (typeof exp === 'number') return new Date(exp * 1000);
			if (exp === null) return null;
		}
	}
	return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
}

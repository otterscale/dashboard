import { env } from '$env/dynamic/private';

interface ClientCredentialsTokens {
	access_token: string;
	expires_in: number;
	refresh_expires_in: number;
	token_type: string;
	'not-before-policy': number;
	scope: string;
}

export interface GetUsersOptions {
	search?: string;
	first?: number;
	max?: number;
}

export interface User {
	id: string;
	createdTimestamp: number;
	username: string;
	enabled: boolean;
	totp: boolean;
	emailVerified: boolean;
	firstName?: string;
	lastName?: string;
	email?: string;
	disableableCredentialTypes?: string[];
	requiredActions?: string[];
	notBefore?: number;
	access?: {
		manageGroupMembership: boolean;
		view: boolean;
		mapRoles: boolean;
		impersonate: boolean;
		manage: boolean;
	};
	attributes?: Record<string, string[]>;
}

function getAdminUrl(): string {
	if (!env.KEYCLOAK_REALM_URL) {
		throw new Error('KEYCLOAK_REALM_URL is not configured');
	}
	return env.KEYCLOAK_REALM_URL.replace('/realms/', '/admin/realms/');
}

async function getAccessToken(): Promise<string> {
	const response = await fetch(`${env.KEYCLOAK_REALM_URL}/protocol/openid-connect/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'client_credentials',
			client_id: env.KEYCLOAK_CLIENT_ID ?? '',
			client_secret: env.KEYCLOAK_CLIENT_SECRET ?? ''
		})
	});

	if (!response.ok) {
		throw new Error('Failed to get client credentials tokens');
	}

	const tokens: ClientCredentialsTokens = await response.json();
	if (!tokens.access_token) {
		throw new Error('Access token is missing');
	}
	return tokens.access_token;
}

async function fetchUsers(
	adminUrl: string,
	headers: Record<string, string>,
	params: URLSearchParams
): Promise<User[]> {
	const response = await fetch(`${adminUrl}/users?${params}`, { headers });
	if (!response.ok) {
		const errorText = await response.text();
		console.error(
			`Failed to get users from Keycloak: ${response.status} ${response.statusText}`,
			errorText
		);
		throw new Error('Failed to get users from Keycloak');
	}
	return response.json();
}

export async function getUserBySubject(subject: string): Promise<User | null> {
	const adminUrl = getAdminUrl();
	const accessToken = await getAccessToken();
	const headers = { Authorization: `Bearer ${accessToken}` };

	const response = await fetch(`${adminUrl}/users/${encodeURIComponent(subject)}`, { headers });
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		const errorText = await response.text();
		console.error(
			`Failed to get user from Keycloak: ${response.status} ${response.statusText}`,
			errorText
		);
		throw new Error('Failed to get user from Keycloak');
	}
	return response.json();
}

export async function getUsers(options: GetUsersOptions = {}): Promise<User[]> {
	const { search = '', first = 0, max = 10 } = options;

	const adminUrl = getAdminUrl();
	const accessToken = await getAccessToken();
	const headers = { Authorization: `Bearer ${accessToken}` };

	const userParams = new URLSearchParams({ first: first.toString(), max: max.toString() });
	if (search) {
		userParams.set('search', search);
	}

	// Service account users have username "service-account-<clientId>"
	const serviceAccountParams = new URLSearchParams({
		first: '0',
		max: max.toString(),
		username: 'service-account-'
	});

	const [users, serviceAccountUsers] = await Promise.all([
		fetchUsers(adminUrl, headers, userParams),
		fetchUsers(adminUrl, headers, serviceAccountParams).catch(() => [] as User[])
	]);

	if (search) {
		const lowerSearch = search.toLowerCase();
		const filtered = serviceAccountUsers.filter(
			(u) =>
				u.username?.toLowerCase().includes(lowerSearch) ||
				u.firstName?.toLowerCase().includes(lowerSearch) ||
				u.lastName?.toLowerCase().includes(lowerSearch) ||
				u.email?.toLowerCase().includes(lowerSearch)
		);
		return [...users, ...filtered];
	}

	return [...users, ...serviceAccountUsers];
}

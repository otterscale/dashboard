/**
 * System-level Harbor robot provisioning for the import-cluster wizard.
 *
 * tenant-operator authenticates to Harbor as this robot to manage each
 * workspace's project/robot/imagePullSecret. Uses the Harbor admin, not the
 * signed-in user: creating a system robot requires system admin. Callers must
 * authorize the request themselves before calling in.
 */
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

/** Harbor's built-in system administrator. Not configurable in Harbor. */
const HARBOR_ADMIN_USERNAME = 'admin';

/** Derived from the cluster name, so re-importing finds the same robot instead of a new one. */
const ROBOT_NAME_PREFIX = 'otterscale-agent-';

const ROBOTS_PATH = '/api/v2.0/robots';

export interface AgentRobot {
	/** Full Harbor name, e.g. `robot$otterscale-agent-prod`. */
	name: string;
	secret: string;
	/** True when this replaced an existing robot; its old secret is now dead. */
	rotated: boolean;
}

interface RobotRef {
	id: number;
	name: string;
}

/**
 * Mirrors the Harbor permission set tenant-operator/internal/harbor/client.go
 * relies on — no more. robot list/read at system scope only lets it discover
 * existing robots; the per-workspace robots it actually creates and deletes are
 * project-scoped, so robot create/delete sit under the project entry.
 * repository pull/push is needed transitively — Harbor won't let a robot grant
 * access it doesn't hold, and the per-workspace robots it creates carry those.
 * project:delete / repository:delete / artifact:delete are deliberately absent,
 * so a leaked secret can't destroy an image or project.
 */
const ROBOT_PERMISSIONS = [
	{
		kind: 'system',
		namespace: '/',
		access: [
			{ resource: 'project', action: 'list' },
			{ resource: 'project', action: 'create' },
			{ resource: 'robot', action: 'list' },
			{ resource: 'robot', action: 'read' }
		]
	},
	{
		kind: 'project',
		namespace: '*',
		access: [
			{ resource: 'project', action: 'read' },
			{ resource: 'member', action: 'list' },
			{ resource: 'member', action: 'read' },
			{ resource: 'member', action: 'create' },
			{ resource: 'member', action: 'update' },
			{ resource: 'member', action: 'delete' },
			{ resource: 'robot', action: 'list' },
			{ resource: 'robot', action: 'read' },
			{ resource: 'robot', action: 'create' },
			{ resource: 'robot', action: 'delete' },
			{ resource: 'repository', action: 'pull' },
			{ resource: 'repository', action: 'push' }
		]
	}
];

function harborBaseURL(): string {
	const endpoint = publicEnv.PUBLIC_HARBOR_URL;
	if (!endpoint) {
		throw new Error('PUBLIC_HARBOR_URL is not configured');
	}
	return endpoint.replace(/\/$/, '');
}

function authorizationHeader(): string {
	const password = env.HARBOR_ADMIN_PASSWORD;
	if (!password) {
		throw new Error(
			'HARBOR_ADMIN_PASSWORD is not configured; the chart sets it only when harbor.enabled'
		);
	}
	return `Basic ${Buffer.from(`${HARBOR_ADMIN_USERNAME}:${password}`).toString('base64')}`;
}

async function request(method: string, path: string, body?: unknown): Promise<Response> {
	const headers: Record<string, string> = {
		Authorization: authorizationHeader(),
		Accept: 'application/json'
	};
	if (body !== undefined) {
		headers['Content-Type'] = 'application/json';
	}

	return fetch(`${harborBaseURL()}${path}`, {
		method,
		headers,
		body: body === undefined ? undefined : JSON.stringify(body)
	});
}

/** Includes the response body: Harbor puts the reason there, not in the status. */
async function unexpectedStatus(operation: string, response: Response): Promise<Error> {
	const text = await response.text().catch(() => '');
	return new Error(`${operation}: unexpected status ${response.status}: ${text.slice(0, 512)}`);
}

/**
 * Finds a system robot by exact name, or null. `q` is narrowed server-side
 * (results are paged) and double-encoded because Harbor decodes it once
 * itself — mirrors tenant-operator's findRobot.
 */
async function findRobot(fullName: string): Promise<RobotRef | null> {
	const q = `Level=system,name=~${fullName.replace(/^robot\$/, '')}`;
	const path = `${ROBOTS_PATH}?q=${encodeURIComponent(encodeURIComponent(q))}&page_size=100`;

	const response = await request('GET', path);
	if (!response.ok) {
		throw await unexpectedStatus('listing Harbor robots', response);
	}

	const robots = (await response.json()) as Array<{ id: number; name: string }>;
	// The name filter is a substring match, so the exact comparison decides.
	const found = robots.find((robot) => robot.name === fullName);
	return found ? { id: found.id, name: found.name } : null;
}

async function createRobot(name: string): Promise<{ name: string; secret: string }> {
	const response = await request('POST', ROBOTS_PATH, {
		name,
		description: 'Managed by the otterscale import-cluster wizard',
		duration: -1, // never expires — held for the cluster's lifetime, unattended
		level: 'system',
		permissions: ROBOT_PERMISSIONS
	});

	if (response.status !== 201) {
		throw await unexpectedStatus('creating Harbor robot account', response);
	}

	const created = (await response.json()) as { name?: string; secret?: string };
	if (!created.name || !created.secret) {
		throw new Error('creating Harbor robot account: Harbor returned no name or secret');
	}
	return { name: created.name, secret: created.secret };
}

async function deleteRobot(id: number): Promise<void> {
	const response = await request('DELETE', `${ROBOTS_PATH}/${id}`);
	// Already gone is not a failure: the goal is that it no longer exists.
	if (!response.ok && response.status !== 404) {
		throw await unexpectedStatus('deleting Harbor robot account', response);
	}
}

/**
 * Creates the cluster's Harbor robot, replacing any robot of the same name.
 * Harbor never reveals a secret after creation, so an existing robot has to
 * be rotated (delete-then-create) rather than reused. The caller should
 * surface `rotated` as a warning: anything holding the old secret breaks.
 */
export async function ensureAgentRobot(cluster: string): Promise<AgentRobot> {
	const name = `${ROBOT_NAME_PREFIX}${cluster}`;
	const fullName = `robot$${name}`;

	const existing = await findRobot(fullName);
	if (existing) {
		await deleteRobot(existing.id);
	}

	const created = await createRobot(name);
	return { name: created.name, secret: created.secret, rotated: existing !== null };
}

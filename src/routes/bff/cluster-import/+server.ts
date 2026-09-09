import { error, json } from '@sveltejs/kit';
import Ajv from 'ajv';

import {
	buildAgentInstallCommands,
	resolveAgentChartVersion,
	validateClusterName
} from '$lib/server/agent-install';
import { ensureAgentRobot } from '$lib/server/harbor-robot';
import { issueJoinToken, JoinTokenError } from '$lib/server/join-token';
import { clusterInfoFieldsSchema } from '$lib/utils/cluster-info-schema';

import type { RequestHandler } from './$types';

interface ImportClusterRequest {
	cluster?: string;
	extraUsers?: string[];
	rancherProjectId?: string;
	clusterInfo?: {
		enabled?: boolean;
		externalAddress?: string;
		nodePortRangeMin?: number;
		nodePortRangeMax?: number;
		inferenceURL?: string;
	};
}

// Same fragment the client form compiles (import-cluster-external.svelte) — the client only
// adds title/errorMessage on top for display; the rules themselves live in one place so this
// endpoint can't silently drift from what the form already enforced. $data is needed for
// nodePortRangeMax's cross-reference to nodePortRangeMin.
const ajv = new Ajv({ allErrors: true, strict: true, $data: true });
const validateClusterInfoFields = ajv.compile(clusterInfoFieldsSchema);
// inferenceURL is optional; its format is only checked when a non-empty value is sent. Compiled
// from the same property so the rule can't diverge, and used on both the enabled and disabled
// paths below.
const validateInferenceURL = ajv.compile(clusterInfoFieldsSchema.properties.inferenceURL);

function describeClusterInfoError(errors: typeof validateClusterInfoFields.errors): string {
	const err = errors?.[0];
	if (!err) return 'clusterInfo is invalid';
	if (err.keyword === 'required') {
		return `clusterInfo.${err.params.missingProperty} is required unless cluster info is disabled`;
	}
	switch (err.instancePath) {
		case '/externalAddress':
			return 'clusterInfo.externalAddress must be a bare host or IP — no scheme, no port';
		case '/nodePortRangeMin':
			return 'clusterInfo.nodePortRangeMin must be a port number between 0 and 65535';
		case '/nodePortRangeMax':
			return err.keyword === 'exclusiveMinimum'
				? 'clusterInfo.nodePortRangeMax must be greater than clusterInfo.nodePortRangeMin'
				: 'clusterInfo.nodePortRangeMax must be a port number between 0 and 65535';
		case '/inferenceURL':
			return 'clusterInfo.inferenceURL must be a bare host or IP — no scheme, no port';
		default:
			return `clusterInfo is invalid: ${err.instancePath || err.keyword}`;
	}
}

export const POST: RequestHandler = async ({ fetch, locals, request }) => {
	if (!locals.session) {
		error(401, 'Unauthorized');
	}
	// Provisions a system-level Harbor robot and reveals its secret — admin-only.
	if (!locals.session.user.roles.includes('admin')) {
		error(403, 'Forbidden');
	}

	const body = (await request.json().catch(() => ({}))) as ImportClusterRequest;

	const cluster = body.cluster?.trim() ?? '';
	const invalid = validateClusterName(cluster);
	if (invalid) {
		error(400, `Cluster name ${invalid}`);
	}

	const clusterInfoEnabled = body.clusterInfo?.enabled ?? false;
	const externalAddress = body.clusterInfo?.externalAddress?.trim() ?? '';
	const nodePortRangeMin = body.clusterInfo?.nodePortRangeMin;
	const nodePortRangeMax = body.clusterInfo?.nodePortRangeMax;
	const inferenceURL = body.clusterInfo?.inferenceURL?.trim() ?? '';

	// externalAddress/nodePortRange are required only while cluster info is enabled; inferenceURL
	// is always optional, its format checked only when a non-empty value is sent. Both branches
	// validate through the same compiled schema, so the rules can't drift from what the form
	// enforced.
	if (clusterInfoEnabled) {
		if (
			!validateClusterInfoFields({
				externalAddress,
				nodePortRangeMin,
				nodePortRangeMax,
				inferenceURL
			})
		) {
			error(400, describeClusterInfoError(validateClusterInfoFields.errors));
		}
	} else if (inferenceURL && !validateInferenceURL(inferenceURL)) {
		error(400, 'clusterInfo.inferenceURL must be a bare host or IP — no scheme, no port');
	}

	// The caller is added unconditionally, so importing a cluster can't lock them out of it.
	const clusterAdminUsers = [
		...new Set([locals.session.user.sub, ...(body.extraUsers ?? [])].filter(Boolean))
	];

	// Degrades to null rather than throwing — nothing to unwind if unreachable.
	const chartVersion = await resolveAgentChartVersion(fetch);

	// Issued before the robot: if this fails, no robot secret has been rotated yet.
	let joinToken: string;
	try {
		joinToken = await issueJoinToken(fetch, cluster);
	} catch (err) {
		console.error('Failed to issue the join token for the agent:', err);
		if (err instanceof JoinTokenError) {
			error(err.status, err.message);
		}
		error(502, 'Failed to issue a join token from the otterscale API');
	}

	let robot;
	try {
		robot = await ensureAgentRobot(cluster);
	} catch (err) {
		console.error('Failed to provision the Harbor robot for the agent:', err);
		error(502, 'Failed to provision the Harbor robot account in Harbor');
	}

	try {
		const commands = buildAgentInstallCommands({
			chartVersion,
			cluster,
			clusterAdminUsers,
			joinToken,
			rancherProjectID: body.rancherProjectId?.trim() || undefined,
			clusterInfo: {
				enabled: clusterInfoEnabled,
				externalAddress,
				nodePortRangeMin: nodePortRangeMin ?? 0,
				nodePortRangeMax: nodePortRangeMax ?? 0,
				inferenceURL: inferenceURL || undefined
			},
			harborRobotName: robot.name,
			harborRobotSecret: robot.secret
		});

		return json({
			...commands,
			robot: { name: robot.name, rotated: robot.rotated }
		});
	} catch (err) {
		// The robot exists but its secret only lives in the response we failed to
		// build; a retry rotates and recovers it.
		console.error('Failed to build the agent install command:', err);
		error(500, err instanceof Error ? err.message : 'Failed to build the agent install command');
	}
};

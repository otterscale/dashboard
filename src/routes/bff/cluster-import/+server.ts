import { error, json } from '@sveltejs/kit';

import {
	buildAgentInstallCommands,
	resolveAgentChartVersion,
	validateClusterName
} from '$lib/server/agent-install';
import { ensureAgentRobot } from '$lib/server/harbor-robot';
import { issueJoinToken, JoinTokenError } from '$lib/server/join-token';

import type { RequestHandler } from './$types';

interface ImportClusterRequest {
	cluster?: string;
	extraUsers?: string[];
	rancherProjectId?: string;
	clusterInfo?: {
		enabled?: boolean;
		externalAddress?: string;
		nodePortRange?: string;
		inferenceURL?: string;
	};
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
	const nodePortRange = body.clusterInfo?.nodePortRange?.trim() ?? '';
	if (clusterInfoEnabled) {
		// Mirrors the agent chart's own validate.yaml checks.
		if (!externalAddress) {
			error(400, 'clusterInfo.externalAddress is required unless cluster info is disabled');
		}
		if (externalAddress.includes('://')) {
			error(400, 'clusterInfo.externalAddress must be a bare address, without a scheme');
		}
		if (!/^[0-9]+-[0-9]+$/.test(nodePortRange)) {
			error(400, 'clusterInfo.nodePortRange must look like "30000-32767"');
		}
		const [low, high] = nodePortRange.split('-').map(Number);
		if (low >= high) {
			error(400, `clusterInfo.nodePortRange is inverted: "${nodePortRange}"`);
		}
	}

	const inferenceURL = body.clusterInfo?.inferenceURL?.trim() ?? '';
	if (inferenceURL && !/^https?:\/\//.test(inferenceURL)) {
		error(400, 'clusterInfo.inferenceURL must be an absolute http or https URL');
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
				nodePortRange,
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

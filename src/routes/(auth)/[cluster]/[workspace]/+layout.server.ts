import type { LayoutServerLoad } from './$types';

type SelfSubjectRulesReviewStatusResourceRule = {
	verbs: string[];
	apiGroups?: string[];
	resources?: string[];
};

type SelfSubjectRulesReviewStatus = {
	resourceRules?: SelfSubjectRulesReviewStatusResourceRule[];
	incomplete?: boolean;
};

type SelfSubjectRulesReviewResponse = {
	object?: {
		status?: SelfSubjectRulesReviewStatus;
	};
};

interface WorkspaceResponse {
	object?: {
		spec?: { namespace?: string };
	};
}

export const load: LayoutServerLoad = async ({ params, fetch }) => {
	try {
		const workspacesResponse = await fetch('/otterscale.resource.v1.ResourceService/Get', {
			method: 'POST',
			headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
			body: JSON.stringify({
				cluster: params.cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				name: params.workspace
			})
		});

		if (!workspacesResponse.ok) {
			return { namespace: '', resourceRules: [] };
		}

		const workspaces = (await workspacesResponse.json()) as WorkspaceResponse;

		const namespace = workspaces.object?.spec?.namespace ?? '';

		const selfSubjectRulesReviewsResponse = await fetch(
			'/otterscale.resource.v1.ResourceService/Create',
			{
				method: 'POST',
				headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster: params.cluster,
					group: 'authorization.k8s.io',
					version: 'v1',
					resource: 'selfsubjectrulesreviews',
					manifest: Buffer.from(
						JSON.stringify({
							apiVersion: 'authorization.k8s.io/v1',
							kind: 'SelfSubjectRulesReview',
							spec: { namespace }
						}),
						'utf-8'
					).toString('base64')
				})
			}
		);

		if (!selfSubjectRulesReviewsResponse.ok) {
			return { namespace: '', resourceRules: [] };
		}

		const selfSubjectRulesReviews =
			(await selfSubjectRulesReviewsResponse.json()) as SelfSubjectRulesReviewResponse;

		const resourceRules = selfSubjectRulesReviews.object?.status?.resourceRules ?? [];

		return { namespace, resourceRules };
	} catch (error) {
		console.error('Failed to resolve workspace namespace:', error);
		return {
			namespace: '',
			resourceRules: []
		};
	}
};

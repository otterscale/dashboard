import type { LayoutServerLoad } from './$types';

export type ResourceRule = {
	verbs: string[];
	apiGroups?: string[];
	resources?: string[];
	resourceNames?: string[];
};

export type NonResourceRule = {
	verbs: string[];
	nonResourceURLs?: string[];
};

/** Mirrors authorization.k8s.io/v1 SelfSubjectRulesReviewStatus, minus evaluationError; resourceRules is guaranteed present. */
export type SelfSubjectRulesReviewStatus = {
	resourceRules: ResourceRule[];
	nonResourceRules?: NonResourceRule[];
	/** True when the authorizer could not enumerate every rule (Node / webhook / OPA), when evaluation partially failed, or when this lookup failed outright. Either way the rules are a lower bound, never the full set. */
	incomplete?: boolean;
};

type SelfSubjectRulesReviewResponse = {
	object?: {
		status?: {
			resourceRules?: ResourceRule[];
			nonResourceRules?: NonResourceRule[];
			incomplete?: boolean;
			evaluationError?: string;
		};
	};
};

type WorkspaceResponse = {
	object?: { spec?: { namespace?: string } };
};

/** Fail closed on data, open on meaning: no rules to act on, but flagged so the UI shows "unknown" rather than "denied". */
function unknownStatus(reason: string): SelfSubjectRulesReviewStatus {
	console.warn('[workspace] permissions unknown:', reason);
	return {
		resourceRules: [],
		nonResourceRules: [],
		incomplete: true
	};
}

export const load: LayoutServerLoad = async ({ params, fetch }) => {
	// Declared outside the try so the catch can still report the namespace if we got that far.
	let namespace = '';

	try {
		const workspaceResponse = await fetch('/otterscale.resource.v1.ResourceService/Get', {
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

		if (!workspaceResponse.ok) {
			return {
				namespace,
				selfsubjectrulesreviewStatus: unknownStatus(
					`Failed to read workspace "${params.workspace}"`
				)
			};
		}

		const workspace = (await workspaceResponse.json()) as WorkspaceResponse;
		namespace = workspace.object?.spec?.namespace ?? '';

		if (!namespace) {
			return {
				namespace,
				selfsubjectrulesreviewStatus: unknownStatus(
					`Workspace "${params.workspace}" has no spec.namespace`
				)
			};
		}

		const selfsubjectrulesreviewResponse = await fetch(
			'/otterscale.resource.v1.ResourceService/Create',
			{
				method: 'POST',
				headers: { 'x-proxy-target': 'api', 'Content-Type': 'application/json' },
				body: JSON.stringify({
					cluster: params.cluster,
					group: 'authorization.k8s.io',
					version: 'v1',
					resource: 'selfsubjectrulesreviews',
					// btoa is ASCII-only, which is fine: namespace names are RFC 1123 labels.
					// Avoid Buffer, which is not guaranteed outside adapter-node.
					manifest: btoa(
						JSON.stringify({
							apiVersion: 'authorization.k8s.io/v1',
							kind: 'SelfSubjectRulesReview',
							spec: { namespace }
						})
					)
				})
			}
		);

		if (!selfsubjectrulesreviewResponse.ok) {
			return {
				namespace,
				selfsubjectrulesreviewStatus: unknownStatus('Failed to retrieve permission rules')
			};
		}

		const selfsubjectrulesreview =
			(await selfsubjectrulesreviewResponse.json()) as SelfSubjectRulesReviewResponse;
		const { incomplete, resourceRules, nonResourceRules, evaluationError } =
			selfsubjectrulesreview.object?.status ?? {};

		// If the backend only echoes the submitted manifest, status is undefined.
		// Do not treat that as zero permissions, or the UI locks itself out for no reason.
		if (!Array.isArray(resourceRules)) {
			return {
				namespace,
				selfsubjectrulesreviewStatus: unknownStatus('SelfSubjectRulesReview response has no status')
			};
		}

		return {
			namespace,
			selfsubjectrulesreviewStatus: {
				resourceRules,
				nonResourceRules,
				// A partial evaluation failure still yields usable rules, but they are only a lower bound.
				incomplete: incomplete || Boolean(evaluationError)
			}
		};
	} catch (error) {
		console.error('[workspace] permission load failed:', error);
		return { namespace, selfsubjectrulesreviewStatus: unknownStatus('Permission lookup failed') };
	}
};

/**
 * Where a number or a name on the Workspace overview leads in the Kubernetes pages.
 *
 * The detail page is `/{cluster}/{workspace}/{name}?group&version&kind&resource&namespace`, the
 * list page `/{cluster}/{workspace}?group&version&kind&resource&query`, the same shapes the
 * sidebar and the cluster dashboard build. This module only decides the name and the search
 * string; the component prefixes the path with `resolve()`.
 *
 * The list page filters with `query` (liqe), matched against the table's row: its columns
 * (`Name`, `Namespace`, …) and the object under `raw`. Three things about it, measured on the
 * page:
 * - A cluster admin's list spans every namespace, so the namespace is always in the query.
 * - `Field:value` is a contains match, quoted or not (`Name:qwen-kserve` also finds
 *   `qwen-kserve-router-scheduler`), so names go in an anchored regex.
 * - Two regexes in one query do not parse ("Ambiguous results.") and the table then shows every
 *   row, so all names go in one regex, `Name:/^(a|b)$/`, and nothing else is a regex. The
 *   namespace and the phase are plain terms: generated namespace names do not contain one
 *   another, and no phase name contains another.
 */

export type ResourceKind = {
	group: string;
	version: string;
	kind: string;
	resource: string;
};

export const POD: ResourceKind = { group: '', version: 'v1', kind: 'Pod', resource: 'pods' };
export const PVC: ResourceKind = {
	group: '',
	version: 'v1',
	kind: 'PersistentVolumeClaim',
	resource: 'persistentvolumeclaims'
};
export const DEPLOYMENT: ResourceKind = {
	group: 'apps',
	version: 'v1',
	kind: 'Deployment',
	resource: 'deployments'
};
export const STATEFUL_SET: ResourceKind = {
	group: 'apps',
	version: 'v1',
	kind: 'StatefulSet',
	resource: 'statefulsets'
};
export const JOB: ResourceKind = { group: 'batch', version: 'v1', kind: 'Job', resource: 'jobs' };
export const LLM_INFERENCE_SERVICE: ResourceKind = {
	group: 'serving.kserve.io',
	version: 'v1alpha2',
	kind: 'LLMInferenceService',
	resource: 'llminferenceservices'
};
export const HELM_RELEASE: ResourceKind = {
	group: 'helm.toolkit.fluxcd.io',
	version: 'v2',
	kind: 'HelmRelease',
	resource: 'helmreleases'
};

/** A detail page when `name` is set, the filtered list otherwise. */
export type LinkTarget = { kind: ResourceKind; name?: string; search: string };

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

/** One anchored regex for exact matches: `/^(a|b)$/`. */
export function exactRegex(values: string[]): string {
	const unique = [...new Set(values)].sort();
	return `/^(${unique.map(escapeRegex).join('|')})$/`;
}

function namespaceClause(namespace: string): string {
	return `Namespace:${namespace}`;
}

function search(kind: ResourceKind, extra: Record<string, string>): string {
	return new URLSearchParams({ ...kind, ...extra }).toString();
}

/** One resource's detail page. */
export function detailLink(kind: ResourceKind, namespace: string, name: string): LinkTarget {
	return { kind, name, search: search(kind, { namespace }) };
}

/** The list filtered to these names in the namespace. */
export function namesListLink(kind: ResourceKind, namespace: string, names: string[]): LinkTarget {
	return {
		kind,
		search: search(kind, {
			query: `${namespaceClause(namespace)} AND Name:${exactRegex(names)}`
		})
	};
}

/**
 * One name opens its detail page, several open the list filtered to them, none is no link.
 */
export function namesLink(
	kind: ResourceKind,
	namespace: string,
	names: string[]
): LinkTarget | null {
	const unique = [...new Set(names)];
	if (unique.length === 0) return null;
	if (unique.length === 1) return detailLink(kind, namespace, unique[0]!);
	return namesListLink(kind, namespace, unique);
}

/**
 * The list filtered on `status.phase`. Not the `Status` column: for a Pod that is the kubectl
 * status (`Init:CrashLoopBackOff` for a Pending pod), so it would not match the count.
 */
export function phaseListLink(kind: ResourceKind, namespace: string, phase: string): LinkTarget {
	return {
		kind,
		search: search(kind, {
			query: `${namespaceClause(namespace)} AND raw.status.phase:${phase}`
		})
	};
}

/** A rule from the namespace's SelfSubjectRulesReview (authorization.k8s.io/v1). */
export type ResourceRule = { verbs: string[]; apiGroups?: string[]; resources?: string[] };

export type RulesReview = { resourceRules: ResourceRule[]; incomplete?: boolean } | undefined;

/**
 * Whether the viewer may open this kind's pages (list and get). When the review could not list
 * every rule, a kind it does not mention is unknown rather than denied, so the link stays.
 */
export function canOpen(review: RulesReview, kind: ResourceKind): boolean {
	if (!review) return true;
	const allows = (verb: string) =>
		review.resourceRules.some(
			(rule) =>
				(rule.verbs.includes(verb) || rule.verbs.includes('*')) &&
				(rule.apiGroups ?? []).some((group) => group === kind.group || group === '*') &&
				(rule.resources ?? []).some((resource) => resource === kind.resource || resource === '*')
		);
	if (allows('list') && allows('get')) return true;
	return review.incomplete === true;
}

/** The names a tooltip lists: the first five, sorted, and how many more there are. */
export function tooltipNames(names: string[], max = 5): { shown: string[]; more: number } {
	const unique = [...new Set(names)].sort();
	return { shown: unique.slice(0, max), more: Math.max(0, unique.length - max) };
}

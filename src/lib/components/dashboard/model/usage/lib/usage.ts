/*
 * AI Gateway usage, joined with the ApiKey CRs that say who made each key.
 *
 * Prometheus knows API keys only: `tenant_id` is the key's client ID, `<namespace>.<key name>`.
 * The person behind a key is the key's `maas.phison.com/created-by` annotation, which holds a
 * Kubernetes username (a Keycloak subject UUID for people, `system:serviceaccount:<ns>:<name>`
 * for service accounts). PromQL cannot join on that, so everything below runs in the browser.
 */

export type View = 'user' | 'key' | 'workspace' | 'model';
export type SortKey = 'tokens' | 'requests' | 'failed';

export type Totals = {
	requests: number;
	failed: number;
	/** Includes `cached`: the gateway records prompt_tokens and its cached_tokens detail. */
	input: number;
	cached: number;
	/** Includes `reasoning`: completion_tokens and its reasoning_tokens detail. */
	output: number;
	reasoning: number;
};

/** One key × model × operation, summed over the window. */
export type UsageFact = { tenant: string; model: string; operation: string; totals: Totals };

/** One key × model, per time bucket; every array has one value per bucket. */
export type SeriesFact = {
	tenant: string;
	model: string;
	input: number[];
	output: number[];
	requests: number[];
	failed: number[];
};

export type ApiKeyInfo = {
	namespace: string;
	name: string;
	createdBy: string;
	/** ISO creation time. */
	created?: string;
};

export type Directory = {
	/** By client ID (`<namespace>.<name>`). `null` when the ApiKeys could not be read. */
	keys: Map<string, ApiKeyInfo> | null;
	/** Workspace name by namespace. */
	workspaces: Map<string, string>;
	/** Display name by Kubernetes username, from Workspace members. */
	people: Map<string, string>;
};

/** Users-view row for usage whose key no longer exists. */
export const DELETED_KEYS = '~deleted';
/** Users-view row for keys whose creator is not recorded, or when keys could not be read. */
export const UNKNOWN_OWNER = '~unknown';

const SERVICE_ACCOUNT_PREFIX = 'system:serviceaccount:';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function emptyTotals(): Totals {
	return { requests: 0, failed: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
}

export function tokensOf(t: Totals): number {
	return t.input + t.output;
}

export function addTotals(into: Totals, add: Totals): Totals {
	into.requests += add.requests;
	into.failed += add.failed;
	into.input += add.input;
	into.cached += add.cached;
	into.output += add.output;
	into.reasoning += add.reasoning;
	return into;
}

/** `db286l.woody-2` → namespace `db286l`, key `woody-2`. Key names cannot contain dots. */
export function splitTenant(tenant: string): { namespace: string; key: string } {
	const dot = tenant.indexOf('.');
	if (dot < 0) return { namespace: '', key: tenant };
	return { namespace: tenant.slice(0, dot), key: tenant.slice(dot + 1) };
}

export type Owner = {
	id: string;
	name: string;
	serviceAccount: boolean;
	/** False when the name is only a shortened identifier. */
	named: boolean;
};

/** Who a `created-by` value is, as far as the Workspace member lists can tell. */
export function resolveOwner(createdBy: string, people: Map<string, string>): Owner {
	if (!createdBy) return { id: UNKNOWN_OWNER, name: '', serviceAccount: false, named: false };
	if (createdBy.startsWith(SERVICE_ACCOUNT_PREFIX)) {
		const name = people.get(createdBy) ?? createdBy.split(':').pop() ?? createdBy;
		return { id: createdBy, name, serviceAccount: true, named: true };
	}
	const name = people.get(createdBy);
	if (name) return { id: createdBy, name, serviceAccount: false, named: true };
	if (UUID.test(createdBy)) {
		return {
			id: createdBy,
			name: `${createdBy.slice(0, 8)}…`,
			serviceAccount: false,
			named: false
		};
	}
	return { id: createdBy, name: createdBy, serviceAccount: false, named: true };
}

export function hasUsage(t: Totals): boolean {
	return t.requests > 0 || t.failed > 0 || tokensOf(t) > 0;
}

type Dims = Record<View, string> & { namespace: string };

function dimsOf(tenant: string, model: string, dir: Directory): Dims {
	const { namespace } = splitTenant(tenant);
	let user = UNKNOWN_OWNER;
	if (dir.keys) {
		const info = dir.keys.get(tenant);
		user = info ? resolveOwner(info.createdBy, dir.people).id : DELETED_KEYS;
	}
	return { user, key: tenant, workspace: namespace, model: `${namespace}/${model}`, namespace };
}

/** The id of the row a fact falls under in `view`. */
export function rowIdOf(view: View, tenant: string, model: string, dir: Directory): string {
	return dimsOf(tenant, model, dir)[view];
}

export function filterFacts<T extends { tenant: string; model: string }>(
	facts: T[],
	view: View,
	id: string,
	dir: Directory
): T[] {
	return facts.filter((f) => rowIdOf(view, f.tenant, f.model, dir) === id);
}

export type Row = {
	id: string;
	view: View;
	label: string;
	totals: Totals;
	/** Tokens, requests and failures per bucket, for the trend line. */
	trend: Record<SortKey, number[]>;
	/** Keys with usage in the window. */
	keys: string[];
	/** Users (owner ids) with usage in the window. */
	users: string[];
	/** Namespaces the usage came from. */
	namespaces: string[];
	operations: string[];
	/** Users view: the creator. Keys view: the key's creator, when the key still exists. */
	owner?: Owner;
	/** Keys view: the ApiKey is gone. */
	deleted?: boolean;
	/** Keys view: ISO creation time of the ApiKey. */
	created?: string;
	/** Model view: the model's short name. */
	model?: string;
	/** Kept at the bottom, without a rank: the Users view's "Deleted keys". */
	pinned?: boolean;
};

const zeros = (n: number) => Array.from({ length: n }, () => 0);

/** Rows for one view, unsorted. Facts with no usage are left out. */
export function buildRows(
	view: View,
	facts: UsageFact[],
	series: SeriesFact[],
	dir: Directory,
	buckets = 0
): Row[] {
	const rows = new Map<string, Row>();
	const keySets = new Map<
		string,
		{ keys: Set<string>; users: Set<string>; ns: Set<string>; ops: Set<string> }
	>();

	for (const fact of facts) {
		if (!hasUsage(fact.totals)) continue;
		const d = dimsOf(fact.tenant, fact.model, dir);
		const id = d[view];
		let row = rows.get(id);
		if (!row) {
			row = {
				id,
				view,
				label: '',
				totals: emptyTotals(),
				trend: { tokens: zeros(buckets), requests: zeros(buckets), failed: zeros(buckets) },
				keys: [],
				users: [],
				namespaces: [],
				operations: []
			};
			rows.set(id, row);
			keySets.set(id, { keys: new Set(), users: new Set(), ns: new Set(), ops: new Set() });
		}
		addTotals(row.totals, fact.totals);
		const sets = keySets.get(id)!;
		sets.keys.add(fact.tenant);
		if (d.user !== DELETED_KEYS && d.user !== UNKNOWN_OWNER) sets.users.add(d.user);
		if (d.namespace) sets.ns.add(d.namespace);
		if (fact.operation) sets.ops.add(fact.operation);
	}

	for (const s of series) {
		const row = rows.get(dimsOf(s.tenant, s.model, dir)[view]);
		if (!row) continue;
		for (let i = 0; i < buckets; i++) {
			row.trend.tokens[i] += (s.input[i] ?? 0) + (s.output[i] ?? 0);
			row.trend.requests[i] += s.requests[i] ?? 0;
			row.trend.failed[i] += s.failed[i] ?? 0;
		}
	}

	for (const row of rows.values()) {
		const sets = keySets.get(row.id)!;
		row.keys = [...sets.keys].sort();
		row.users = [...sets.users].sort();
		row.namespaces = [...sets.ns].sort();
		row.operations = [...sets.ops].sort();
		describe(row, dir);
	}
	return [...rows.values()];
}

function describe(row: Row, dir: Directory) {
	switch (row.view) {
		case 'user': {
			if (row.id === DELETED_KEYS) {
				row.pinned = true;
				return;
			}
			if (row.id === UNKNOWN_OWNER) return;
			row.owner = resolveOwner(row.id, dir.people);
			row.label = row.owner.name;
			return;
		}
		case 'key': {
			const { key } = splitTenant(row.id);
			row.label = key;
			const info = dir.keys?.get(row.id);
			if (dir.keys && !info) row.deleted = true;
			if (info) {
				row.owner = resolveOwner(info.createdBy, dir.people);
				row.created = info.created;
			}
			return;
		}
		case 'workspace':
			row.label = dir.workspaces.get(row.id) ?? row.id;
			return;
		case 'model': {
			const slash = row.id.indexOf('/');
			row.model = row.id.slice(slash + 1);
			row.label = row.model;
			return;
		}
	}
}

export function sortValue(t: Totals, sort: SortKey): number {
	if (sort === 'requests') return t.requests;
	if (sort === 'failed') return t.failed;
	return tokensOf(t);
}

/** Largest first, ties by tokens then name; pinned rows stay last. */
export function sortRows(rows: Row[], sort: SortKey): Row[] {
	return [...rows].sort((a, b) => {
		if (a.pinned !== b.pinned) return a.pinned ? 1 : -1;
		return (
			sortValue(b.totals, sort) - sortValue(a.totals, sort) ||
			tokensOf(b.totals) - tokensOf(a.totals) ||
			a.label.localeCompare(b.label) ||
			a.id.localeCompare(b.id)
		);
	});
}

export type Summary = {
	totals: Totals;
	keysUsed: number;
	/** ApiKey CRs in scope; `null` when they could not be read. */
	keysTotal: number | null;
	users: number;
	workspaces: number;
	models: number;
};

/** `namespace` narrows the ApiKey count to one Workspace; empty counts them all. */
export function summarize(facts: UsageFact[], dir: Directory, namespace = ''): Summary {
	const totals = emptyTotals();
	const keys = new Set<string>();
	const users = new Set<string>();
	const workspaces = new Set<string>();
	const models = new Set<string>();
	for (const fact of facts) {
		if (!hasUsage(fact.totals)) continue;
		addTotals(totals, fact.totals);
		const d = dimsOf(fact.tenant, fact.model, dir);
		keys.add(d.key);
		if (d.user !== DELETED_KEYS && d.user !== UNKNOWN_OWNER) users.add(d.user);
		if (d.workspace) workspaces.add(d.workspace);
		models.add(d.model);
	}
	// Keys that exist now, plus deleted ones used in the window: the keys there were.
	let keysTotal: number | null = null;
	if (dir.keys) {
		keysTotal = 0;
		const inScope = (ns: string) => !namespace || ns === namespace;
		for (const info of dir.keys.values()) if (inScope(info.namespace)) keysTotal++;
		for (const key of keys) {
			if (!dir.keys.has(key) && inScope(splitTenant(key).namespace)) keysTotal++;
		}
	}
	return {
		totals,
		keysUsed: keys.size,
		keysTotal,
		users: users.size,
		workspaces: workspaces.size,
		models: models.size
	};
}

/** Per-bucket sums of the given series, for the two hourly charts. */
export function bucketTotals(series: SeriesFact[], buckets: number) {
	const out = {
		input: zeros(buckets),
		output: zeros(buckets),
		requests: zeros(buckets),
		failed: zeros(buckets)
	};
	for (const s of series) {
		for (let i = 0; i < buckets; i++) {
			out.input[i] += s.input[i] ?? 0;
			out.output[i] += s.output[i] ?? 0;
			out.requests[i] += s.requests[i] ?? 0;
			out.failed[i] += s.failed[i] ?? 0;
		}
	}
	return out;
}

/** What the detail's breakdown tables group the selection by. */
export const BREAKDOWNS: Record<View, View[]> = {
	user: ['key', 'model'],
	key: ['model'],
	workspace: ['user', 'model'],
	model: ['user', 'key']
};

/** Failure share at or above which the Failed number takes the warning colour. */
export const FAILED_WARN_RATIO = 0.02;

export function failedIsHigh(t: Totals): boolean {
	return t.requests > 0 && t.failed / t.requests >= FAILED_WARN_RATIO;
}

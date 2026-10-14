/*
 * A regular user's dashboard: what they see, and that the charts carry data
 * from their own namespace only. Runs against a deployed dashboard:
 *
 *   E2E_BASE_URL=https://<dashboard> E2E_IGNORE_HTTPS_ERRORS=1 \
 *   E2E_TENANT_USERNAME=... E2E_TENANT_PASSWORD=... \
 *   E2E_CLUSTER=<cluster> E2E_WORKSPACE=<workspace name> E2E_NAMESPACE=<its namespace> \
 *   [E2E_MODEL=<an LLMInferenceService in that namespace>] \
 *   pnpm exec playwright test e2e/tenant-metrics.test.ts
 *
 * The user must be a plain Workspace member (view is enough): not cluster-admin,
 * not bound to otterscale:metrics-cluster-view, in no Keycloak group that
 * grants either. An admin account proves nothing here — admins keep cluster
 * scope. E2E_EXPECT_VM_DATA / E2E_EXPECT_MODEL_DATA=1 also require data on the
 * compute / model pages (set them when the namespace runs a VM / a model);
 * E2E_MODEL names the model for the analytics and model-service tests, which
 * are skipped without it. E2E_OTHER_NAMESPACE (default kube-system) is a
 * namespace the user has no access to, for the server's own refusals.
 */
import { expect, type Page, test } from '@playwright/test';

const env = {
	username: process.env.E2E_TENANT_USERNAME ?? '',
	password: process.env.E2E_TENANT_PASSWORD ?? '',
	cluster: process.env.E2E_CLUSTER ?? '',
	workspace: process.env.E2E_WORKSPACE ?? '',
	namespace: process.env.E2E_NAMESPACE ?? ''
};

/** Optional: the model whose analytics and actions are checked. */
const model = process.env.E2E_MODEL ?? '';

/** A namespace the user may not see, for asking the server what the dashboard never asks. */
const otherNamespace = process.env.E2E_OTHER_NAMESPACE ?? 'kube-system';

/** The server's named queries (otterscale internal/handler/proxy_shared_catalog.go). */
const SHARED_NAMES = new Set([
	'gpu-util',
	'gpu-fb-used',
	'gpu-fb-total',
	'gpu-inventory',
	'vgpu-memory-limit',
	'vgpu-memory-used',
	'host-gpu-fb-used',
	'host-gpu-fb-total',
	'host-gpu-count',
	'gpu-xid-total',
	'gpu-xid-by-gpu',
	'kubevirt-handlers',
	'kubevirt-controllers',
	'kubevirt-controllers-ready',
	'ceph-total-bytes',
	'gpu-allocated-memory',
	'gpu-allocated-cores',
	'gpu-shared-count'
]);

test.skip(
	!process.env.E2E_BASE_URL || Object.values(env).some((v) => !v),
	'needs E2E_BASE_URL and the E2E_TENANT_* / E2E_CLUSTER / E2E_WORKSPACE / E2E_NAMESPACE variables'
);
// Two-step Keycloak login plus a dashboard that queries after mount: the
// 30 s default has timed out once in beforeEach alone.
test.describe.configure({ timeout: 120_000 });

type Sample = {
	metric?: Record<string, string>;
	value?: [number, string];
	values?: [number, string][];
};
type Captured = { url: URL; status: number; result: Sample[] };
type SharedCall = { name: string; status: number; params: URLSearchParams };

/** Infrastructure metrics: never in a namespace-scoped query; the shared scope serves them by name. */
const INFRASTRUCTURE = [
	'ceph_cluster_total_bytes',
	'kubevirt_info',
	'kubevirt_virt_controller_ready_status',
	'DCGM_FI_DEV_FB_USED',
	'DCGM_FI_DEV_XID_ERRORS'
];

function watchMetrics(page: Page) {
	const tenancy: Captured[] = [];
	const shared: SharedCall[] = [];
	const clusterScope: string[] = [];
	const sharedPrefix = `/proxy/${env.cluster}/prometheus-shared/`;
	page.on('request', (req) => {
		if (req.url().includes(`/proxy/${env.cluster}/prometheus/`)) clusterScope.push(req.url());
	});
	page.on('response', async (res) => {
		const url = new URL(res.url());
		if (url.pathname.startsWith(sharedPrefix)) {
			shared.push({
				name: url.pathname.slice(sharedPrefix.length),
				status: res.status(),
				params: url.searchParams
			});
			return;
		}
		if (!url.pathname.startsWith(`/proxy/${env.cluster}/prometheus-tenancy/`)) return;
		let result: Sample[] = [];
		try {
			const body = await res.json();
			result = Array.isArray(body?.data?.result) ? body.data.result : [];
		} catch {
			// label answers are not vectors
		}
		tenancy.push({ url, status: res.status(), result });
	});
	return { tenancy, shared, clusterScope };
}

/**
 * Wait for an answer to each named shared query. Start it before the action
 * that sends them, so the answers it waits for come after that action.
 */
function sharedAnswers(page: Page, names: string[]) {
	const path = (name: string) => `/proxy/${env.cluster}/prometheus-shared/${name}`;
	return Promise.all(
		names.map((name) => page.waitForResponse((res) => new URL(res.url()).pathname === path(name)))
	);
}

/** Every shared call is a known name, answered, asked as this Workspace; `names` were all asked. */
function expectShared(calls: SharedCall[], names: string[]) {
	for (const c of calls) {
		expect(SHARED_NAMES.has(c.name), `unknown shared query ${c.name}`).toBe(true);
		expect(c.status, `${c.name} answered ${c.status}`).toBeLessThan(400);
		expect(c.params.getAll('namespace')).toEqual([env.namespace]);
	}
	const asked = new Set(calls.map((c) => c.name));
	for (const name of names) expect(asked.has(name), `${name} was not asked`).toBe(true);
}

const sentQueries = (captured: Captured[]) =>
	captured.map((c) =>
		[c.url.searchParams.get('query') ?? '', ...c.url.searchParams.getAll('match[]')].join(' ')
	);

function hasData(captured: Captured[]) {
	return captured.some((c) =>
		c.result.some((s) => {
			const v = Number(s.value?.[1] ?? s.values?.at(-1)?.[1]);
			return Number.isFinite(v) && v !== 0;
		})
	);
}

function expectOwnNamespaceOnly(captured: Captured[]) {
	expect(captured.length, 'no namespace-scoped query was sent').toBeGreaterThan(0);
	for (const c of captured) {
		expect(c.status, `${c.url.pathname} answered ${c.status}`).toBeLessThan(400);
		expect(c.url.searchParams.getAll('namespace')).toEqual([env.namespace]);
		for (const s of c.result) {
			if (s.metric?.namespace !== undefined) expect(s.metric.namespace).toBe(env.namespace);
		}
	}
}

async function login(page: Page) {
	await page.goto('/login');
	// The otterscale realm asks for the username first, then the password on a second page.
	await page.locator('#username').fill(env.username);
	await page.locator('#kc-login').click();
	await page.locator('#password').fill(env.password);
	await page.locator('#kc-login').click();
	// Back on the dashboard: not on another origin's Keycloak, nor on one mounted under /auth/,
	// nor still on /login/callback.
	await page.waitForURL(
		(url) =>
			url.origin === new URL(process.env.E2E_BASE_URL ?? '').origin &&
			!/^\/(auth|login)(\/|$)/.test(url.pathname),
		{ timeout: 60_000 }
	);
}

const dashboard = (name: string) => `/${env.cluster}/${env.workspace}/dashboard/${name}`;

/**
 * Open a dashboard and wait until its widgets, which query after mount, have
 * been answered: at least one namespace-scoped query, and each of `sharedNames`.
 */
async function visit(page: Page, name: string, sharedNames: string[] = []) {
	const watched = watchMetrics(page);
	const answered = sharedAnswers(page, sharedNames);
	await page.goto(dashboard(name));
	await answered;
	await expect
		.poll(() => watched.tenancy.length, { message: 'no namespace-scoped query' })
		.toBeGreaterThan(0);
	await page.waitForLoadState('networkidle');
	return watched;
}

test.beforeEach(async ({ page }) => {
	await login(page);
});

test('the sidebar has no cluster or storage dashboard', async ({ page }) => {
	await page.goto(dashboard('overview'));
	await page.waitForLoadState('networkidle');
	// The sidebar has rendered once the model link is in the DOM; only then does a
	// missing link mean anything. Attached, not visible: on the overview its group
	// is collapsed, and sub-items of a closed group are in the DOM but hidden.
	await expect(page.locator(`a[href$="/dashboard/model"]`).first()).toBeAttached();
	await expect(page.locator(`a[href$="/dashboard/cluster"]`)).toHaveCount(0);
	await expect(page.locator(`a[href$="/dashboard/storage"]`)).toHaveCount(0);
});

for (const name of ['cluster', 'storage']) {
	test(`opening the ${name} dashboard directly lands on the overview and says why`, async ({
		page
	}) => {
		await page.goto(dashboard(name));
		await page.waitForURL(
			(url) => url.pathname.endsWith('/dashboard/overview') && !url.searchParams.has('notice')
		);
		await expect(page.getByText(/cluster metrics access|叢集指標權限/)).toBeVisible();
	});
}

test('the server refuses cluster scope, another namespace, and shared without a namespace', async ({
	page
}) => {
	expect(otherNamespace).not.toBe(env.namespace);
	// Straight to the server through the dashboard's proxy, as the page's own requests go.
	const ask = (path: string, params: Record<string, string> = {}) =>
		page.request.get(`/proxy/${env.cluster}/${path}`, {
			headers: { 'x-proxy-target': 'api' },
			params
		});

	const cluster = await ask('prometheus/api/v1/query', { query: 'up' });
	expect(cluster.status(), 'cluster scope').toBe(403);
	const tenancy = await ask('prometheus-tenancy/api/v1/query', {
		query: 'up',
		namespace: otherNamespace
	});
	expect(tenancy.status(), `namespace scope in ${otherNamespace}`).toBe(403);
	const shared = await ask('prometheus-shared/ceph-total-bytes');
	expect(shared.status(), 'shared scope without a namespace').toBe(403);
	// The same shared query as this Workspace is answered: the 403 above is the namespace's doing.
	const own = await ask('prometheus-shared/ceph-total-bytes', { namespace: env.namespace });
	expect(own.status(), 'shared scope as this Workspace').toBe(200);
});

test('overview shows their namespace, and the cluster capacity through the shared scope', async ({
	page
}) => {
	const { tenancy, shared, clusterScope } = await visit(page, 'overview', ['ceph-total-bytes']);
	expectOwnNamespaceOnly(tenancy);
	await expect.poll(() => hasData(tenancy), { message: 'overview charts are empty' }).toBe(true);
	expect(clusterScope).toEqual([]);
	for (const q of sentQueries(tenancy)) for (const m of INFRASTRUCTURE) expect(q).not.toContain(m);
	expectShared(shared, ['ceph-total-bytes']);
});

test('compute stays in their namespace and shows KubeVirt components', async ({ page }) => {
	const kubevirt = ['kubevirt-handlers', 'kubevirt-controllers', 'kubevirt-controllers-ready'];
	const { tenancy, shared, clusterScope } = await visit(page, 'compute', kubevirt);
	expectOwnNamespaceOnly(tenancy);
	expect(clusterScope).toEqual([]);
	for (const q of sentQueries(tenancy)) {
		for (const m of INFRASTRUCTURE) expect(q).not.toContain(m);
		expect(q).not.toContain('exported_namespace');
	}
	expectShared(shared, kubevirt);
	if (process.env.E2E_EXPECT_VM_DATA === '1')
		await expect.poll(() => hasData(tenancy), { message: 'compute charts are empty' }).toBe(true);
});

test('model overview stays in their namespace', async ({ page }) => {
	const { tenancy, shared, clusterScope } = await visit(page, 'model');
	expectOwnNamespaceOnly(tenancy);
	expect(clusterScope).toEqual([]);
	for (const q of sentQueries(tenancy)) for (const m of INFRASTRUCTURE) expect(q).not.toContain(m);
	expectShared(shared, []);
	if (process.env.E2E_EXPECT_MODEL_DATA === '1')
		await expect.poll(() => hasData(tenancy), { message: 'model charts are empty' }).toBe(true);
});

test('model analytics shows GPU memory and XID through the shared scope', async ({ page }) => {
	test.skip(!model, 'needs E2E_MODEL');
	const watched = watchMetrics(page);
	const gpuNames = [
		'host-gpu-fb-used',
		'host-gpu-fb-total',
		'host-gpu-count',
		'gpu-xid-total',
		'gpu-xid-by-gpu'
	];
	// The panels query once a model is picked; started before any click, this
	// also catches answers for a model the page picked on its own.
	const answered = sharedAnswers(page, gpuNames);
	await page.goto(dashboard('model'));
	await page.getByRole('tab', { name: /^(Analytics|分析)$/ }).click();
	await page.getByRole('combobox').first().click();
	await page.getByRole('option', { name: model, exact: true }).click();
	await answered;

	await expect(
		page.getByText(/GPU Memory: Allocated vs Used|GPU 記憶體：已分配 vs 已使用/)
	).toBeVisible();
	await expect(page.getByText('XID', { exact: true })).toBeVisible();
	expectOwnNamespaceOnly(watched.tenancy);
	expect(watched.clusterScope).toEqual([]);
	expectShared(watched.shared, gpuNames);
});

test('a model service shows its GPU allocation and the GPU resources', async ({ page }) => {
	test.skip(!model, 'needs E2E_MODEL');
	const watched = watchMetrics(page);
	const list = `/${env.cluster}/${env.workspace}?group=serving.kserve.io&version=v1alpha2&kind=LLMInferenceService&resource=llminferenceservices`;
	const openActions = async () => {
		await page
			.getByRole('row', { name: new RegExp(model) })
			.getByRole('button')
			.last()
			.click();
	};

	await page.goto(list);
	await openActions();
	const allocationNames = [
		'gpu-util',
		'gpu-fb-used',
		'gpu-fb-total',
		'gpu-allocated-memory',
		'gpu-shared-count'
	];
	const allocationAnswered = sharedAnswers(page, allocationNames);
	await page.getByRole('menuitem', { name: /^(GPU Allocation|GPU 分配)$/ }).click();
	await expect(page.getByRole('dialog')).toBeVisible();
	await allocationAnswered;
	expectShared(watched.shared, allocationNames);
	await page.keyboard.press('Escape');

	await openActions();
	// The GPU resources ask as the Update dialog opens, before their button is clicked.
	const resourceNames = ['gpu-inventory', 'vgpu-memory-limit', 'vgpu-memory-used'];
	const resourcesAnswered = sharedAnswers(page, resourceNames);
	await page.getByRole('menuitem', { name: /^Update$/ }).click();
	// The row behind the dialog has GPU icons too; the overlay would take the click.
	await page.getByRole('dialog').last().locator('button:has(svg.lucide-gpu)').first().click();
	await expect(page.getByText('GPU Resources', { exact: true })).toBeVisible();
	await resourcesAnswered;
	expectShared(watched.shared, resourceNames);
	expect(watched.clusterScope).toEqual([]);
});

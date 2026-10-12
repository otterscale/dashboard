/*
 * A regular user's dashboard: what they see, and that the charts carry data
 * from their own namespace only. Runs against a deployed dashboard:
 *
 *   E2E_BASE_URL=https://<dashboard> E2E_IGNORE_HTTPS_ERRORS=1 \
 *   E2E_TENANT_USERNAME=... E2E_TENANT_PASSWORD=... \
 *   E2E_CLUSTER=<cluster> E2E_WORKSPACE=<workspace name> E2E_NAMESPACE=<its namespace> \
 *   pnpm exec playwright test e2e/tenant-metrics.test.ts
 *
 * The user must be a plain Workspace member (view is enough): not cluster-admin,
 * not bound to otterscale:metrics-cluster-view, in no Keycloak group that
 * grants either. An admin account proves nothing here — admins keep cluster
 * scope. E2E_EXPECT_VM_DATA / E2E_EXPECT_MODEL_DATA=1 also require data on the
 * compute / model pages (set them when the namespace runs a VM / a model).
 */
import { expect, type Page, test } from '@playwright/test';

const env = {
	username: process.env.E2E_TENANT_USERNAME ?? '',
	password: process.env.E2E_TENANT_PASSWORD ?? '',
	cluster: process.env.E2E_CLUSTER ?? '',
	workspace: process.env.E2E_WORKSPACE ?? '',
	namespace: process.env.E2E_NAMESPACE ?? ''
};

test.skip(
	!process.env.E2E_BASE_URL || Object.values(env).some((v) => !v),
	'needs E2E_BASE_URL and the E2E_TENANT_* / E2E_CLUSTER / E2E_WORKSPACE / E2E_NAMESPACE variables'
);

type Sample = {
	metric?: Record<string, string>;
	value?: [number, string];
	values?: [number, string][];
};
type Captured = { url: URL; status: number; result: Sample[] };

/** Infrastructure metrics a namespace-scoped page must not even ask for. */
const INFRASTRUCTURE = [
	'ceph_cluster_total_bytes',
	'kubevirt_info',
	'kubevirt_virt_controller_ready_status',
	'DCGM_FI_DEV_FB_USED',
	'DCGM_FI_DEV_XID_ERRORS'
];

function watchMetrics(page: Page) {
	const tenancy: Captured[] = [];
	const clusterScope: string[] = [];
	page.on('request', (req) => {
		if (req.url().includes(`/proxy/${env.cluster}/prometheus/`)) clusterScope.push(req.url());
	});
	page.on('response', async (res) => {
		const url = new URL(res.url());
		if (!url.pathname.startsWith(`/proxy/${env.cluster}/prometheus-tenancy/`)) return;
		let result: Sample[] = [];
		try {
			const body = await res.json();
			result = Array.isArray(body?.data?.result) ? body.data.result : [];
		} catch {
			// metadata and label answers are not vectors
		}
		tenancy.push({ url, status: res.status(), result });
	});
	return { tenancy, clusterScope };
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
			!/^\/(auth|login)(\/|$)/.test(url.pathname)
	);
}

const dashboard = (name: string) => `/${env.cluster}/${env.workspace}/dashboard/${name}`;

async function visit(page: Page, name: string) {
	const watched = watchMetrics(page);
	await page.goto(dashboard(name));
	await page.waitForLoadState('networkidle');
	await page.waitForTimeout(3_000); // widgets query after mount
	return watched;
}

test.beforeEach(async ({ page }) => {
	await login(page);
});

test('the sidebar has no cluster or storage dashboard', async ({ page }) => {
	await page.goto(dashboard('overview'));
	await page.waitForLoadState('networkidle');
	await expect(page.locator(`a[href$="/dashboard/cluster"]`)).toHaveCount(0);
	await expect(page.locator(`a[href$="/dashboard/storage"]`)).toHaveCount(0);
	await expect(page.locator(`a[href$="/dashboard/model"]`).first()).toBeVisible();
});

for (const name of ['cluster', 'storage']) {
	test(`opening the ${name} dashboard directly lands on the overview`, async ({ page }) => {
		await page.goto(dashboard(name));
		await page.waitForURL((url) => url.pathname.endsWith('/dashboard/overview'));
	});
}

test('overview shows their namespace, with data, and nothing cluster-wide', async ({ page }) => {
	const { tenancy, clusterScope } = await visit(page, 'overview');
	expectOwnNamespaceOnly(tenancy);
	expect(hasData(tenancy), 'overview charts are empty').toBe(true);
	expect(clusterScope).toEqual([]);
	for (const q of sentQueries(tenancy)) for (const m of INFRASTRUCTURE) expect(q).not.toContain(m);
});

test('compute stays in their namespace and hides KubeVirt components', async ({ page }) => {
	const { tenancy, clusterScope } = await visit(page, 'compute');
	expectOwnNamespaceOnly(tenancy);
	expect(clusterScope).toEqual([]);
	for (const q of sentQueries(tenancy)) {
		for (const m of INFRASTRUCTURE) expect(q).not.toContain(m);
		expect(q).not.toContain('exported_namespace');
	}
	if (process.env.E2E_EXPECT_VM_DATA === '1')
		expect(hasData(tenancy), 'compute charts are empty').toBe(true);
});

test('model stays in their namespace and hides GPU memory and XID', async ({ page }) => {
	const { tenancy, clusterScope } = await visit(page, 'model');
	expectOwnNamespaceOnly(tenancy);
	expect(clusterScope).toEqual([]);
	for (const q of sentQueries(tenancy)) for (const m of INFRASTRUCTURE) expect(q).not.toContain(m);
	if (process.env.E2E_EXPECT_MODEL_DATA === '1')
		expect(hasData(tenancy), 'model charts are empty').toBe(true);
});

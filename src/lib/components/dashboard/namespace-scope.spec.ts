import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

function files(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		return statSync(path).isDirectory() ? files(path) : [path];
	});
}

// Namespace scope forces namespace="<ns>". KubeVirt's PodMonitor keeps the
// VMI's own namespace label (helm-charts kubevirt 1.2.0), so a selector on
// exported_namespace would only ever match nothing for a tenant.
describe('compute dashboard', () => {
	it('selects VM metrics on namespace, not exported_namespace', () => {
		const dir = join(process.cwd(), 'src/lib/components/dashboard/compute');
		const offenders = files(dir).filter((f) =>
			readFileSync(f, 'utf8').includes('exported_namespace')
		);
		expect(offenders).toEqual([]);
	});

	it('builds namespace matchers with namespaceSelector, so "all namespaces" selects all', () => {
		const dir = join(process.cwd(), 'src/lib/components/dashboard/compute');
		const offenders = files(dir).filter((f) => /namespace="\$\{/.test(readFileSync(f, 'utf8')));
		expect(offenders).toEqual([]);
	});
});

/**
 * Everything a Workspace page renders: its routes and the components they use.
 * The cluster and storage dashboards live under the Workspace route too, but
 * only viewers with cluster metrics access reach them.
 */
const workspaceRoots = [
	'src/lib/components/dashboard/workspace',
	'src/lib/components/dashboard/model',
	'src/lib/components/dashboard/compute',
	'src/lib/components/gpu-allocation',
	'src/lib/components/kind-viewer',
	'src/routes/(auth)/[cluster]/[workspace]'
];
const clusterOnly = [
	'src/lib/components/dashboard/cluster/',
	'src/lib/components/dashboard/storage/',
	'src/routes/(auth)/[cluster]/[workspace]/dashboard/cluster/',
	'src/routes/(auth)/[cluster]/[workspace]/dashboard/storage/'
];

function workspaceFiles(): string[] {
	return workspaceRoots
		.flatMap((root) => files(join(process.cwd(), root)))
		.map((f) => relative(process.cwd(), f).split(sep).join('/'))
		.filter((f) => /\.(svelte|ts)$/.test(f) && !f.endsWith('.spec.ts'))
		.filter((f) => !clusterOnly.some((dir) => f.startsWith(dir)));
}

/**
 * $lib/prometheus exports that reach past the Workspace's namespace: the
 * cluster-scope driver, and PromQL pieces over node, GPU and disk exporters.
 */
const infrastructureHelpers = [
	'clusterPrometheusDriver',
	'dcgmNodeSelector',
	'DCGM_GPU_MEMORY_TOTAL_BYTES',
	'DCGM_GPU_MEMORY_USED_BYTES',
	'ai100DiskRate',
	'ai100DiskRateByNode',
	'AIDAPTIV_CACHE_DEVICE_CLASS'
];

/** Infrastructure metrics: their series can name other tenants' pods, or none. */
const infrastructureMetrics =
	/DCGM_FI_|hami_|kubevirt_info|kubevirt_virt_controller|\bceph_|node_disk_|node_uname_info|topolvm_/;

const forbidden: [string, RegExp][] = [
	['new PrometheusDriver', /\bnew\s+PrometheusDriver\b/],
	...infrastructureHelpers.map((name): [string, RegExp] => [name, new RegExp(`\\b${name}\\b`)]),
	['infrastructure metric', infrastructureMetrics]
];

// Workspace pages make drivers with workspacePrometheusDriver, which keeps a
// viewer without cluster metrics access at namespace scope, and take GPU,
// KubeVirt and Ceph numbers from the server's named queries (shared scope),
// for admins and members alike. No file they render may pick the cluster
// scope or carry infrastructure PromQL of its own.
describe('workspace pages', () => {
	const scanned = workspaceFiles();

	it('scans every directory a Workspace page renders from', () => {
		for (const root of workspaceRoots) expect(existsSync(join(process.cwd(), root))).toBe(true);
		expect(scanned).toContain('src/lib/components/dashboard/model/analytics/b-gpu-memory.svelte');
		expect(scanned).toContain(
			'src/routes/(auth)/[cluster]/[workspace]/dashboard/model/+page.svelte'
		);
		expect(scanned.some((f) => clusterOnly.some((dir) => f.startsWith(dir)))).toBe(false);
	});

	it('forbids helpers that $lib/prometheus still exports', () => {
		const source = readFileSync(join(process.cwd(), 'src/lib/prometheus.ts'), 'utf8');
		for (const name of infrastructureHelpers) {
			expect(source).toMatch(new RegExp(`export (const|function) ${name}\\b`));
		}
	});

	it('use no cluster-scope driver and no infrastructure PromQL', () => {
		const offenders = scanned.flatMap((file) => {
			const source = readFileSync(join(process.cwd(), file), 'utf8');
			return forbidden
				.filter(([, pattern]) => pattern.test(source))
				.map(([name]) => `${file}: ${name}`);
		});
		expect(offenders).toEqual([]);
	});
});

// The places that show cluster-wide numbers on a Workspace page, and the
// shared-scope calls they make for them.
describe('shared-scope components', () => {
	const sharedFiles = [
		'src/lib/components/gpu-allocation/gpu-allocation-dialog.svelte',
		'src/lib/components/gpu-allocation/fetch-utilization.ts',
		'src/lib/components/kind-viewer/kind-viewer-actions/utils/gpu-resources.svelte',
		'src/lib/components/dashboard/model/analytics/b-gpu-memory.svelte',
		'src/lib/components/dashboard/model/analytics/b-pod-health.svelte',
		'src/lib/components/dashboard/compute/overview/controller.svelte',
		'src/lib/components/dashboard/compute/overview/worker.svelte',
		'src/lib/components/dashboard/workspace/overview/storage.svelte'
	];
	const sharedCall =
		/\bshared\.(instant|range)\(\s*'[a-z-]+'|\bfetchGpu(Utilization|AllocatedTotals)\(\s*shared\b/;

	for (const file of sharedFiles) {
		it(`${file} queries the shared scope`, () => {
			const source = readFileSync(join(process.cwd(), file), 'utf8');
			expect(source).toMatch(sharedCall);
		});
	}
});

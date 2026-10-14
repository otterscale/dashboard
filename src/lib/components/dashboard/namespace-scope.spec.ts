import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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

// GPU, KubeVirt and Ceph numbers on Workspace pages come from the server's
// named queries (shared scope), for admins and members alike: these files pick
// no cluster-scope driver and carry no infrastructure PromQL of their own.
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
	const infrastructure =
		/DCGM_FI_|hami_|kubevirt_info|kubevirt_virt_controller|ceph_cluster_total_bytes/;

	for (const file of sharedFiles) {
		it(`${file} uses the shared scope`, () => {
			const source = readFileSync(join(process.cwd(), file), 'utf8');
			expect(source).not.toContain('clusterPrometheusDriver');
			expect(source).not.toMatch(infrastructure);
			expect(source).toMatch(/\bshared\b/);
		});
	}
});

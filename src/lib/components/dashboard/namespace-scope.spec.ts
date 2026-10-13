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
// VMI's own namespace label (helm-charts kubevirt 1.1.2), so a selector on
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

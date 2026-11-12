import { describe, expect, it } from 'vitest';

import { resourceQuotaPresence } from './resource-quota';

describe('resourceQuotaPresence', () => {
	it('reports no quota when the namespace is seen but has no kube_resourcequota', () => {
		expect(resourceQuotaPresence(1, 0)).toBe(false);
	});

	it('reports a quota when both the namespace and kube_resourcequota are seen', () => {
		expect(resourceQuotaPresence(1, 3)).toBe(true);
	});

	it('throws when kube-state-metrics has no series for the namespace', () => {
		expect(() => resourceQuotaPresence(0, 0)).toThrow();
		expect(() => resourceQuotaPresence(0, 2)).toThrow();
	});
});

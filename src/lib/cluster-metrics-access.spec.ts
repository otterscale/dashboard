import { describe, expect, it } from 'vitest';

import { clusterDashboardRedirect } from './cluster-metrics-access';

describe('clusterDashboardRedirect', () => {
	const overview = '/c1/ws/dashboard/overview';

	it('sends a denied viewer to the overview', () => {
		expect(clusterDashboardRedirect('denied', overview)).toBe(overview);
	});

	it('keeps an allowed viewer, and one whose check failed', () => {
		expect(clusterDashboardRedirect('allowed', overview)).toBeNull();
		expect(clusterDashboardRedirect('unknown', overview)).toBeNull();
	});
});

import { describe, expect, it } from 'vitest';

import { clusterDashboardRedirect, withoutClusterMetricsNotice } from './cluster-metrics-access';

describe('clusterDashboardRedirect', () => {
	const overview = '/c1/ws/dashboard/overview';

	it('sends a denied viewer to the overview, which then says why', () => {
		expect(clusterDashboardRedirect('denied', overview)).toBe(`${overview}?notice=cluster-metrics`);
	});

	it('keeps an allowed viewer, and one whose check failed', () => {
		expect(clusterDashboardRedirect('allowed', overview)).toBeNull();
		expect(clusterDashboardRedirect('unknown', overview)).toBeNull();
	});
});

describe('withoutClusterMetricsNotice', () => {
	it('is null when there is no notice to show', () => {
		expect(withoutClusterMetricsNotice(new URL('https://d/c1/ws/dashboard/overview'))).toBeNull();
		expect(
			withoutClusterMetricsNotice(new URL('https://d/c1/ws/dashboard/overview?notice=other'))
		).toBeNull();
	});

	it('drops only the notice, keeping the rest of the URL', () => {
		const url = new URL('https://d/c1/ws/dashboard/overview?notice=cluster-metrics&tab=x#top');
		const cleaned = withoutClusterMetricsNotice(url);
		expect(cleaned?.href).toBe('https://d/c1/ws/dashboard/overview?tab=x#top');
		expect(url.searchParams.get('notice')).toBe('cluster-metrics');
	});
});

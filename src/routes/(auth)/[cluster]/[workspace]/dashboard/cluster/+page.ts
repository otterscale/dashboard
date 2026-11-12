import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';
import { clusterDashboardRedirect } from '$lib/cluster-metrics-access';

import type { PageLoad } from './$types';

// Cluster-wide dashboards are for viewers with cluster metrics access; the
// server answers everyone else 403. A bookmarked URL lands on the overview
// instead of a page of failing charts — unless the check itself failed, in
// which case the layout says so and the viewer stays.
export const load: PageLoad = async ({ parent, params }) => {
	const { clusterMetricsAccess } = await parent();
	const target = clusterDashboardRedirect(
		clusterMetricsAccess,
		resolve('/(auth)/[cluster]/[workspace]/dashboard/overview', {
			cluster: params.cluster,
			workspace: params.workspace
		})
	);
	if (target) redirect(307, target);
};

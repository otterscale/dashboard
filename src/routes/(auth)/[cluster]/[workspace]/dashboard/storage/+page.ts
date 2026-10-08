import { redirect } from '@sveltejs/kit';

import { resolve } from '$app/paths';

import type { PageLoad } from './$types';

// Cluster-wide dashboards are for viewers with cluster metrics access; the
// server answers everyone else 403. A bookmarked URL lands on the overview
// instead of a page of failing charts.
export const load: PageLoad = async ({ parent, params }) => {
	const { canViewClusterMetrics } = await parent();
	if (!canViewClusterMetrics) {
		redirect(
			307,
			resolve('/(auth)/[cluster]/[workspace]/dashboard/overview', {
				cluster: params.cluster,
				workspace: params.workspace
			})
		);
	}
};

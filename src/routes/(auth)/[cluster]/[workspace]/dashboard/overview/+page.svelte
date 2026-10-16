<script lang="ts">
	import { tick } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { afterNavigate, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { withoutClusterMetricsNotice } from '$lib/cluster-metrics-access';
	import WorkspaceDashboard from '$lib/components/dashboard/workspace/index.svelte';
	import { m } from '$lib/messages';
	import { breadcrumbs } from '$lib/stores';

	breadcrumbs.set([
		{
			title: m.workspace_dashboard_title(),
			url: resolve('/(auth)/[cluster]/[workspace]/dashboard/overview', {
				cluster: page.params.cluster!,
				workspace: page.data.namespace!
			})
		}
	]);

	// Sent here from a bookmarked Cluster or Storage dashboard: say why, once.
	afterNavigate(async () => {
		const cleaned = withoutClusterMetricsNotice(page.url);
		if (!cleaned) return;
		toast.info(m.cluster_metrics_required());
		// On a first load this runs before the router has started, and
		// replaceState must wait for that.
		await tick();
		// The current URL minus a query parameter, not a new route to resolve.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		replaceState(cleaned, page.state);
	});

	const cluster = $derived(page.params.cluster ?? '');
	const workspace = $derived(page.params.workspace ?? '');
	const namespace = $derived(page.data.namespace ?? '');
</script>

{#key cluster + workspace + namespace}
	<WorkspaceDashboard
		{cluster}
		{namespace}
		canViewClusterMetrics={page.data.canViewClusterMetrics === true}
	/>
{/key}

<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dashboard from '$lib/components/dashboard/compute/index.svelte';
	import { m } from '$lib/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.compute_status(),
			url: resolve('/(auth)/[cluster]/[workspace]/dashboard/compute', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster!);
	const currentWorkspace = $derived(page.params.workspace!);
	const defaultNamespace = $derived(page.data.namespace ?? '');
	const isClusterAdmin = $derived(page.data.isClusterAdmin === true);
</script>

<!-- The dashboard reads the Workspace's namespace once, on mount (a regular user's driver is bound
     to it), so remount it when the Workspace changes instead of querying the previous one. -->
{#key cluster + currentWorkspace + defaultNamespace}
	<Dashboard
		{cluster}
		{defaultNamespace}
		{isClusterAdmin}
		{currentWorkspace}
		canViewClusterMetrics={page.data.canViewClusterMetrics === true}
	/>
{/key}

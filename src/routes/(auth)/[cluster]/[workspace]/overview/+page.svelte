<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import WorkspaceDashboard from '$lib/components/dashboard/workspace/index.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	breadcrumbs.set([
		{
			title: m.workspace_dashboard_title(),
			url: resolve('/(auth)/[cluster]/[workspace]/overview', {
				cluster: page.params.cluster!,
				workspace: page.data.namespace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	const workspace = $derived(page.params.workspace ?? '');
	const namespace = $derived(page.data.namespace ?? '');
</script>

{#key cluster + workspace + namespace}
	<WorkspaceDashboard {cluster} {namespace} />
{/key}

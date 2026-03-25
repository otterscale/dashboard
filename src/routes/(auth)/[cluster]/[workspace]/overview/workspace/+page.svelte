<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import WorkspaceDashboard from '$lib/components/dashbaord/workspace/index.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	const cluster = $derived(page.params.cluster ?? '');
	const workspace = $derived(page.params.workspace ?? '');
	const namespace = $derived(page.data.namespace ?? '');

	breadcrumbs.set([
		{
			title: m.workspace(),
			url: resolve('/(auth)/[cluster]/[workspace]/overview/workspace', {
				cluster,
				workspace
			})
		}
	]);
</script>

{#key cluster + workspace + namespace}
	<WorkspaceDashboard {cluster} {namespace} />
{/key}

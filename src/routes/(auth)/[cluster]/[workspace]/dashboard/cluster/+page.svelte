<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dashboard from '$lib/components/dashboard/cluster/index.svelte';
	import { m } from '$lib/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.cluster_status(),
			url: resolve('/(auth)/[cluster]/[workspace]/dashboard/cluster', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster!);
</script>

{#key cluster}
	<Dashboard {cluster} />
{/key}

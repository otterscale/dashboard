<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dashboard from '$lib/components/models/dashboard/index.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.models(),
			url: resolve('/(auth)/[cluster]/[workspace]/model/dashboard', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const namespace = $derived(page.data.namespace ?? '');
</script>

{#key page.params.cluster! + namespace}
	<Dashboard cluster={page.params.cluster!} {namespace} />
{/key}

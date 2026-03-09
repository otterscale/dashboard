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
			url: resolve('/(auth)/[cluster]/[namespace]/model/dashboard', {
				cluster: page.params.cluster!,
				namespace: page.params.namespace!
			})
		}
	]);
</script>

{#key page.params.cluster! + page.params.namespace!}
	<Dashboard cluster={page.params.cluster!} namespace={page.params.namespace!} />
{/key}

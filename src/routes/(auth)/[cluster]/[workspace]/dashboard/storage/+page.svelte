<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dashboard from '$lib/components/storage/dashboard/index.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.storage_status(),
			url: resolve('/(auth)/[cluster]/[workspace]/dashboard/storage', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);
</script>

{#key page.params.cluster!}
	<Dashboard cluster={page.params.cluster!} />
{/key}

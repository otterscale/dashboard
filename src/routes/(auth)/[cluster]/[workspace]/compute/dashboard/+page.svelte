<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dashboard from '$lib/components/compute/dashboard/index.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.compute(),
			url: resolve('/(auth)/[cluster]/[workspace]/compute/dashboard', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(page.data.namespace ?? '');
</script>

{#key `${cluster}:${namespace}`}
	<Dashboard {cluster} {namespace} />
{/key}

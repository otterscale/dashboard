<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dashboard from '$lib/components/models/dashboard/index.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.model_status(),
			url: resolve('/(auth)/[cluster]/[workspace]/dashboard/model', {
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

{#key cluster}
	<Dashboard {cluster} {defaultNamespace} {isClusterAdmin} {currentWorkspace} />
{/key}

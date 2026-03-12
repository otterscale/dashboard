<script lang="ts">
	import { onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArtifactViewer } from '$lib/components/artifact-viewer';
	import type { ProjectType, RepositoryType } from '$lib/components/artifact-viewer/types';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.hub(),
			url: resolve('/(auth)/[cluster]/[namespace]/hub', {
				cluster: page.params.cluster!,
				namespace: page.params.namespace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	// const namespace = $derived(page.params.namespace ?? '');
	const namespace = 'oci-helm';

	onMount(async () => {
		const repositoriesResponse = await fetch(
			`/rest/harbor/repositories?project=${encodeURIComponent(namespace)}`
		);
		const repositories = await repositoriesResponse.json();
		console.log(repositories);
	});
</script>

{#key cluster + namespace}
	<ArtifactViewer />
{/key}

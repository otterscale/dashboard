<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArtifactViewer } from '$lib/components/artifact-viewer';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.application_hub(),
			url: resolve('/(auth)/[cluster]/[workspace]/hub', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	const namespace = $derived(page.data.namespace ?? '');
</script>

{#key cluster + namespace}
	<ArtifactViewer />
{/key}

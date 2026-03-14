<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.workspace(),
			url: resolve('/(auth)/[cluster]/[workspace]/overview', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);
</script>

Workspace Dashboard

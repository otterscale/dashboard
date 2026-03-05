<script lang="ts">
	import { resolve } from '$app/paths';
	import { RepositoryViewer } from '$lib/components/repository-viewer';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	// Set breadcrumbs navigation
	breadcrumbs.set([
		{
			title: m.registry(),
			url: resolve('/(auth)/registry')
		}
	]);
</script>

<RepositoryViewer />

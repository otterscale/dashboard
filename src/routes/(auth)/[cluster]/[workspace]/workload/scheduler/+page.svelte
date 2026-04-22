<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Construction } from '$lib/components/construction';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	const cluster = $derived(page.params.cluster ?? '');
	const workspace = $derived(page.params.workspace ?? '');

	breadcrumbs.set([
		{
			title: m.workload(),
			url: ''
		},
		{
			title: m.scheduler(),
			url: resolve('/(auth)/[cluster]/[workspace]/workload/scheduler', {
				cluster,
				workspace
			})
		}
	]);
</script>

<Construction />

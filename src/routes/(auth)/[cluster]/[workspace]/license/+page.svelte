<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import LicenseManager from '$lib/components/license/index.svelte';
	import { m } from '$lib/paraglide/messages';
	import { breadcrumbs } from '$lib/stores';

	breadcrumbs.set([
		{
			title: m.administration(),
			url: ''
		},
		{
			title: m.license(),
			url: resolve('/(auth)/[cluster]/[workspace]/license', {
				cluster: page.params.cluster!,
				workspace: page.params.workspace!
			})
		}
	]);

	const cluster = $derived(page.params.cluster ?? '');
	const workspace = $derived(page.params.workspace ?? '');
</script>

{#key cluster + workspace}
	<LicenseManager
		{cluster}
		initialLicense={page.data.license}
		initialClusterFingerprint={page.data.clusterFingerprint}
	/>
{/key}

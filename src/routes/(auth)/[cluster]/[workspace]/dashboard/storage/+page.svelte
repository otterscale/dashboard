<script lang="ts">
	import type { Transport } from '@connectrpc/connect';
	import { getContext, onMount } from 'svelte';

	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Dashboard from '$lib/components/dashboard/storage/index.svelte';
	import { m } from '$lib/messages';
	import { breadcrumbs } from '$lib/stores';
	import { hasRookCephCRD } from '$lib/utils/rook-ceph';

	const transport: Transport = getContext('transport');

	let hasRookCeph = $state(false);

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

	onMount(async () => {
		const exists = await hasRookCephCRD(transport, page.params.cluster!);
		if (!exists) {
			await goto(
				resolve('/(auth)/[cluster]/[workspace]/dashboard/overview', {
					cluster: page.params.cluster!,
					workspace: page.params.workspace!
				})
			);
			return;
		}
		hasRookCeph = true;
	});
</script>

{#if hasRookCeph}
	{#key page.params.cluster!}
		<Dashboard cluster={page.params.cluster!} />
	{/key}
{/if}

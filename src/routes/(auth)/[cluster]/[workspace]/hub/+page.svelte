<script lang="ts">
	import type { JsonValue } from '@bufbuild/protobuf';
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import { getContext, onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ChartViewer, HubChartVariant, listCharts } from '$lib/components/chart-viewer';
	import type { ChartAttribute } from '$lib/components/chart-viewer/table-layout';
	import { m } from '$lib/messages';
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

	const transport: Transport = getContext('transport');
	const resourceClient = createClient(ResourceService, transport);

	let charts: Record<ChartAttribute, JsonValue>[] = $state([]);
	let isFetching = $state(false);

	async function fetchCharts() {
		if (isFetching || !namespace) return;

		isFetching = true;
		try {
			charts = await listCharts(resourceClient, cluster, namespace, HubChartVariant);
		} finally {
			isFetching = false;
		}
	}

	let isMounted = $state(false);
	onMount(() => {
		if (!namespace) return;
		fetchCharts();
		isMounted = true;
	});
</script>

{#key cluster + namespace}
	{#if isMounted}
		<ChartViewer
			chartVariant={HubChartVariant}
			{cluster}
			{namespace}
			{charts}
			{isFetching}
			onReload={fetchCharts}
		/>
	{/if}
{/key}

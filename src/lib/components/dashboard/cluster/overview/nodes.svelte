<script lang="ts">
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { m } from '$lib/messages';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let clusterNodes: SampleValue | undefined = $state(undefined);
	async function fetchClusterNodes() {
		const response = await prometheusDriver.instantQuery(`count(kube_node_info{container!=""})`);
		clusterNodes = response.result[0]?.value ?? undefined;
	}

	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		try {
			await fetchClusterNodes();
			failed = false;
		} catch (error) {
			failed = true;
			console.error('Failed to fetch cluster nodes:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<StatTile
	label={m.node()}
	state={!isLoaded ? 'loading' : failed ? 'error' : clusterNodes === undefined ? 'empty' : 'ready'}
	onretry={fetch}
	value={clusterNodes?.value}
/>

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

	let nodeNotReady: SampleValue | undefined = $state(undefined);
	async function fetchNodeStatus() {
		const responseNotReadyNode = await prometheusDriver.instantQuery(
			`sum(kube_node_status_condition{condition="Ready", status!="true", container!=""}) or vector(0)`
		);
		nodeNotReady = responseNotReadyNode.result[0]?.value ?? undefined;
	}

	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		try {
			await fetchNodeStatus();
			failed = false;
		} catch (error) {
			failed = true;
			console.error('Failed to fetch cluster health:', error);
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

	// Assigned only inside fetch(), which the type checker does not follow: without the
	// annotation it narrows the state to `undefined` here.
	const unreadyNodes = $derived(Number((nodeNotReady as SampleValue | undefined)?.value ?? 0));
</script>

<StatTile
	label={m.state()}
	state={!isLoaded ? 'loading' : failed ? 'error' : nodeNotReady === undefined ? 'empty' : 'ready'}
	onretry={fetch}
	value={unreadyNodes === 0 ? m.status_healthy() : m.status_unhealthy()}
	tone={unreadyNodes === 0 ? 'success' : 'destructive'}
	dot
	hint={unreadyNodes === 0
		? m.all_nodes_ready()
		: unreadyNodes > 0
			? m.nodes_unready({ count: String(unreadyNodes) })
			: m.some_nodes_unready()}
/>

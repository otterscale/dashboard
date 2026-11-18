<script lang="ts">
	import HeartPulseIcon from '@lucide/svelte/icons/heart-pulse';
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

	async function fetch() {
		try {
			await fetchNodeStatus();
		} catch (error) {
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
	icon={HeartPulseIcon}
	loading={!isLoaded}
	value={nodeNotReady === undefined ? null : unreadyNodes === 0 ? 'Healthy' : 'Unhealthy'}
	tone={nodeNotReady === undefined ? 'muted' : unreadyNodes === 0 ? 'success' : 'destructive'}
	hint={nodeNotReady === undefined
		? m.no_data_display()
		: unreadyNodes === 0
			? 'All Nodes Ready'
			: `${unreadyNodes || 'Some'} nodes unready`}
/>

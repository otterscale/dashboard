<script lang="ts">
	import BoxesIcon from '@lucide/svelte/icons/boxes';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	import KpiCard from './kpi-card.svelte';
	import KpiRatioValue from './kpi-ratio-value.svelte';

	// `nodeName` is the Kubernetes node name (the `node` label on kube-state-metrics),
	// not the node_exporter instance.
	let {
		client,
		nodeName,
		isReloading = $bindable()
	}: { client: PrometheusDriver; nodeName: string | undefined; isReloading?: boolean } = $props();

	let runningVal = $state<number | null>(null);
	let allocatableVal = $state<number | null>(null);
	let isLoaded = $state(false);

	async function fetch() {
		const node = escapePromqlStringLiteral(nodeName ?? '');
		try {
			const [runningRes, allocRes] = await Promise.all([
				client.instantQuery(
					`sum(kube_pod_status_phase{phase="Running"} * on(namespace,pod) group_left() kube_pod_info{node="${node}"})`
				),
				client.instantQuery(`kube_node_status_allocatable{resource="pods",node="${node}"}`)
			]);
			runningVal = runningRes.result[0]?.value?.value ?? null;
			allocatableVal = allocRes.result[0]?.value?.value ?? null;
		} catch {
			runningVal = null;
			allocatableVal = null;
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => reloadManager.stop());

	const isEmpty = $derived(runningVal === null || allocatableVal === null);
	const pct = $derived(
		Number(allocatableVal) > 0 ? (Number(runningVal) / Number(allocatableVal)) * 100 : 0
	);
	const subLine = $derived(`${Math.round(Number(runningVal ?? 0))} / ${Math.round(Number(allocatableVal ?? 0))}`);
</script>

<KpiCard
	title={m.pods()}
	description={m.node_detail_pods_description()}
	tooltip={m.node_detail_pods_tooltip()}
	icon={BoxesIcon}
	{isLoaded}
	{isEmpty}
>
	<KpiRatioValue {pct} {subLine} decimals={0} />
</KpiCard>

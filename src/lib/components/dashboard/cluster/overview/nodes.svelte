<script lang="ts">
	import ServerIcon from '@lucide/svelte/icons/server';
	import type { PrometheusDriver } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { m } from '$lib/messages';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	const nodes = useLoadable(
		async () => {
			const response = await prometheusDriver.instantQuery(`count(kube_node_info{container!=""})`);
			const value = Number(response.result[0]?.value?.value);
			return Number.isFinite(value) ? { count: value } : null;
		},
		() => isReloading
	);
</script>

<StatCard label={m.node()} icon={ServerIcon} status={nodes.status} stale={nodes.stale}>
	{nodes.data?.count}
	{#snippet detail()}
		<span class="block truncate" title={m.cluster_dashboard_node_description()}
			>{m.cluster_dashboard_node_description()}</span
		>
	{/snippet}
</StatCard>

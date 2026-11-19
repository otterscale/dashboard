<script lang="ts">
	import HeartPulseIcon from '@lucide/svelte/icons/heart-pulse';
	import type { PrometheusDriver } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { Status } from '$lib/components/shadcnio/status';
	import { m } from '$lib/messages';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Number of nodes whose Ready condition is not true.
	const health = useLoadable(
		async () => {
			const response = await prometheusDriver.instantQuery(
				`sum(kube_node_status_condition{condition="Ready", status!="true", container!=""}) or vector(0)`
			);
			const value = Number(response.result[0]?.value?.value);
			return Number.isFinite(value) ? { notReady: value } : null;
		},
		() => isReloading
	);

	const healthy = $derived(health.data?.notReady === 0);
</script>

<StatCard label={m.dash_state()} icon={HeartPulseIcon} status={health.status} stale={health.stale}>
	<span class="flex min-w-0 items-center gap-2">
		<Status variant={healthy ? 'success' : 'destructive'} class="ring-0" />
		<span class="truncate">{healthy ? m.dash_healthy() : m.dash_unhealthy()}</span>
	</span>
	{#snippet detail()}
		{#if healthy}
			{m.dash_all_nodes_ready()}
		{:else}
			<span class="text-destructive">
				{m.dash_nodes_unready({ count: health.data?.notReady ?? 0 })}
			</span>
		{/if}
	{/snippet}
</StatCard>

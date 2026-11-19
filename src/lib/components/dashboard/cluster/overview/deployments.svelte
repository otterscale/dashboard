<script lang="ts">
	import PackageIcon from '@lucide/svelte/icons/package';
	import type { PrometheusDriver } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace = '',
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace?: string;
		isReloading: boolean;
	} = $props();

	const deployments = useLoadable(
		async () => {
			const ns = (namespace ?? '').trim();
			const nsFilter = ns ? `,namespace="${escapePromqlStringLiteral(ns)}"` : '';
			const response = await prometheusDriver.instantQuery(
				`count(kube_deployment_created{container!=""${nsFilter}})`
			);
			const value = Number(response.result[0]?.value?.value);
			return Number.isFinite(value) ? { count: value } : null;
		},
		() => isReloading
	);
</script>

<StatCard
	label={m.deployments()}
	icon={PackageIcon}
	status={deployments.status}
	stale={deployments.stale}
>
	{deployments.data?.count}
	{#snippet detail()}
		<span class="block truncate" title={m.cluster_dashboard_deployment_description()}
			>{m.cluster_dashboard_deployment_description()}</span
		>
	{/snippet}
</StatCard>

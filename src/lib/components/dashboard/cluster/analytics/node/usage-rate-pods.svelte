<script lang="ts">
	import BoxesIcon from '@lucide/svelte/icons/boxes';
	import { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, fetchCombinedInstantOrNull } from '$lib/prometheus';

	import KpiRatioValue from './kpi-ratio-value.svelte';

	// `nodeName` is the Kubernetes node name (the `node` label on kube-state-metrics),
	// not the node_exporter instance.
	let {
		client,
		nodeName,
		isReloading = $bindable()
	}: { client: PrometheusDriver; nodeName: string | undefined; isReloading?: boolean } = $props();

	// Both scalars come back in a single `or`-unioned instant query.
	const usage = useLoadable(
		async () => {
			const node = escapePromqlStringLiteral(nodeName ?? '');
			const r = orThrow(
				await fetchCombinedInstantOrNull(client, {
					running: `sum(kube_pod_status_phase{phase="Running"} * on(namespace,pod) group_left() kube_pod_info{node="${node}"})`,
					allocatable: `kube_node_status_allocatable{resource="pods",node="${node}"}`
				})
			);
			const running: number | null = r.running[0]?.value?.value ?? null;
			const allocatable: number | null = r.allocatable[0]?.value?.value ?? null;
			if (running === null || allocatable === null) return null;
			return { running: Number(running), allocatable: Number(allocatable) };
		},
		() => isReloading ?? false
	);

	const pct = $derived(
		usage.data && usage.data.allocatable > 0
			? (usage.data.running / usage.data.allocatable) * 100
			: 0
	);
	const subLine = $derived(
		`${Math.round(usage.data?.running ?? 0)} / ${Math.round(usage.data?.allocatable ?? 0)}`
	);
</script>

<KpiRatioValue
	title={m.pods()}
	description={m.node_detail_pods_description()}
	tooltip={m.node_detail_pods_tooltip()}
	icon={BoxesIcon}
	status={usage.status}
	stale={usage.stale}
	{pct}
	{subLine}
	decimals={0}
/>

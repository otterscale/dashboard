<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { fetchCombinedInstantOrNull, LIVE_PODS } from '$lib/prometheus';

	import ResourceCard from './resource-card.svelte';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	function percent(value: unknown): number | null {
		const n = Number(value);
		return value !== undefined && value !== null && Number.isFinite(n) ? n : null;
	}

	// All four scalars come back in a single HTTP request (one `or`-unioned instant query)
	// to keep Prometheus request fan-out low.
	const memory = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					usage: `100 * sum(container_memory_working_set_bytes{container!=""}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
					request: `100 * sum(kube_pod_container_resource_requests{resource="memory", unit="byte"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
					limit: `100 * sum(kube_pod_container_resource_limits{resource="memory", unit="byte"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
					allocatable: `sum(kube_node_status_allocatable{resource="memory", unit="byte"})`
				})
			);
			// Actual consumption (cAdvisor working set) over the same allocatable base as request/limit.
			const usage = percent(r.usage[0]?.value?.value);
			if (usage === null) return null;
			return {
				usage,
				// Reserved memory: what the scheduler checks; at 100% no new pod can be placed.
				request: percent(r.request[0]?.value?.value),
				// Memory limit ceiling: above 100% the cluster is over-committed (OOM/eviction risk).
				limit: percent(r.limit[0]?.value?.value),
				allocatable: percent(r.allocatable[0]?.value?.value)
			};
		},
		() => isReloading
	);

	const allocatable = $derived(
		memory.data?.allocatable == null ? undefined : formatCapacity(memory.data.allocatable)
	);
</script>

<ResourceCard
	title={m.memory()}
	description={m.cluster_dashboard_memory_description()}
	info={m.cluster_dashboard_memory_tooltip()}
	status={memory.status}
	stale={memory.stale}
	capacity={allocatable ? String(allocatable.value) : '—'}
	unit={allocatable?.unit}
	capacityLabel={m.clo_allocatable()}
>
	<Meter label={m.usage()} percent={memory.data?.usage ?? null} swatch="bg-chart-1" />
	<Meter label={m.request()} percent={memory.data?.request ?? null} swatch="bg-chart-2" />
	<Meter label={m.limit()} percent={memory.data?.limit ?? null} swatch="bg-chart-3" />
</ResourceCard>

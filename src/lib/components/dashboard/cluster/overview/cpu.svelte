<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
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
	const cpu = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					usage: `100 * sum(irate(container_cpu_usage_seconds_total{container!=""}[2m])) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
					request: `100 * sum(kube_pod_container_resource_requests{resource="cpu", unit="core"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
					limit: `100 * sum(kube_pod_container_resource_limits{resource="cpu", unit="core"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
					allocatable: `sum(kube_node_status_allocatable{resource="cpu", unit="core"})`
				})
			);
			// Actual consumption (cAdvisor) over the same allocatable base as request/limit, so the
			// three meters are directly comparable.
			const usage = percent(r.usage[0]?.value?.value);
			if (usage === null) return null;
			return {
				usage,
				// Reserved CPU: what the scheduler checks; at 100% no new pod can be placed.
				request: percent(r.request[0]?.value?.value),
				// CPU limit ceiling: above 100% the cluster is over-committed (throttling risk).
				limit: percent(r.limit[0]?.value?.value),
				allocatable: percent(r.allocatable[0]?.value?.value)
			};
		},
		() => isReloading
	);
</script>

<ResourceCard
	title={m.cpu()}
	description={m.cluster_dashboard_cpu_description()}
	info={m.cluster_dashboard_cpu_tooltip()}
	status={cpu.status}
	stale={cpu.stale}
	capacity={cpu.data?.allocatable == null ? '—' : String(cpu.data.allocatable)}
	unit={cpu.data?.allocatable == null ? undefined : m.cores()}
	capacityLabel={m.clo_allocatable()}
>
	<Meter label={m.usage()} percent={cpu.data?.usage ?? null} swatch="bg-chart-1" />
	<Meter label={m.request()} percent={cpu.data?.request ?? null} swatch="bg-chart-2" />
	<Meter label={m.limit()} percent={cpu.data?.limit ?? null} swatch="bg-chart-3" />
</ResourceCard>

<script lang="ts">
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { fetchCombinedOrThrow } from '$lib/components/dashboard/shared/query';
	import RingsCard from '$lib/components/dashboard/shared/rings-card.svelte';
	import { m } from '$lib/messages';
	import { LIVE_PODS } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Actual consumption (cAdvisor) over the same allocatable base as request/limit, so the
	// three rings are directly comparable.
	let cpuUsage: SampleValue | undefined = $state(undefined);
	// Reserved CPU — this is what the scheduler checks; at 100% no new pod can be placed.
	let cpuRequest: SampleValue | undefined = $state(undefined);
	// CPU limit ceiling — above 100% the cluster is over-committed (throttling/eviction risk).
	let cpuLimit: SampleValue | undefined = $state(undefined);
	let allocatableCPU: SampleValue['value'] | undefined = $state(undefined);

	// All four scalars come back in a single HTTP request (one `or`-unioned instant query)
	// to keep Prometheus request fan-out low.
	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		try {
			const r = await fetchCombinedOrThrow(prometheusDriver, {
				usage: `100 * sum(irate(container_cpu_usage_seconds_total{container!=""}[2m])) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
				request: `100 * sum(kube_pod_container_resource_requests{resource="cpu", unit="core"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
				limit: `100 * sum(kube_pod_container_resource_limits{resource="cpu", unit="core"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="cpu", unit="core"})`,
				allocatable: `sum(kube_node_status_allocatable{resource="cpu", unit="core"})`
			});
			cpuUsage = r.usage[0]?.value ?? undefined;
			cpuRequest = r.request[0]?.value ?? undefined;
			cpuLimit = r.limit[0]?.value ?? undefined;
			allocatableCPU = r.allocatable[0]?.value?.value ?? undefined;
			failed = false;
		} catch (error) {
			failed = true;
			console.error('Failed to fetch CPU usage:', error);
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

<RingsCard
	title={m.cpu()}
	description={m.cluster_dashboard_cpu_description()}
	tooltip={m.cluster_dashboard_cpu_tooltip()}
	state={!isLoaded ? 'loading' : failed ? 'error' : !cpuUsage ? 'empty' : 'ready'}
	onretry={fetch}
	total={{ value: String(allocatableCPU), unit: m.unit_core() }}
	totalLabel={m.allocatable_total()}
	rings={[
		{
			key: 'limit',
			label: m.limit(),
			percent: Number(cpuLimit?.value ?? 0),
			color: 'var(--chart-3)'
		},
		{
			key: 'request',
			label: m.request(),
			percent: Number(cpuRequest?.value ?? 0),
			color: 'var(--chart-2)'
		},
		{
			key: 'usage',
			label: m.usage(),
			percent: Number(cpuUsage?.value ?? 0),
			color: 'var(--chart-1)'
		}
	]}
/>

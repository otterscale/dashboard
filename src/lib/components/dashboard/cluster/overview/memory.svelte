<script lang="ts">
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { fetchCombinedOrThrow } from '$lib/components/dashboard/shared/query';
	import RingsCard from '$lib/components/dashboard/shared/rings-card.svelte';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { LIVE_PODS } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Actual consumption (cAdvisor working set) over the same allocatable base as request/limit.
	let memoryUsage: SampleValue | undefined = $state(undefined);
	// Reserved memory — what the scheduler checks; at 100% no new pod can be placed.
	let memoryRequest: SampleValue | undefined = $state(undefined);
	// Memory limit ceiling — above 100% the cluster is over-committed (OOM/eviction risk).
	let memoryLimit: SampleValue | undefined = $state(undefined);
	let allocatableMemory: SampleValue['value'] | undefined = $state(undefined);

	// All four scalars come back in a single HTTP request (one `or`-unioned instant query)
	// to keep Prometheus request fan-out low.
	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		try {
			const r = await fetchCombinedOrThrow(prometheusDriver, {
				usage: `100 * sum(container_memory_working_set_bytes{container!=""}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
				request: `100 * sum(kube_pod_container_resource_requests{resource="memory", unit="byte"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
				limit: `100 * sum(kube_pod_container_resource_limits{resource="memory", unit="byte"} ${LIVE_PODS}) / sum(kube_node_status_allocatable{resource="memory", unit="byte"})`,
				allocatable: `sum(kube_node_status_allocatable{resource="memory", unit="byte"})`
			});
			memoryUsage = r.usage[0]?.value ?? undefined;
			memoryRequest = r.request[0]?.value ?? undefined;
			memoryLimit = r.limit[0]?.value ?? undefined;
			allocatableMemory = r.allocatable[0]?.value?.value ?? undefined;
			failed = false;
		} catch (error) {
			failed = true;
			console.error('Failed to fetch memory usage:', error);
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

	const allocatable = $derived.by(() => {
		const { value, unit } = formatCapacity(Number(allocatableMemory));
		return { value, unit };
	});
</script>

<RingsCard
	title={m.memory()}
	description={m.cluster_dashboard_memory_description()}
	tooltip={m.cluster_dashboard_memory_tooltip()}
	state={!isLoaded ? 'loading' : failed ? 'error' : !memoryUsage ? 'empty' : 'ready'}
	onretry={fetch}
	total={allocatable}
	totalLabel={m.allocatable_total()}
	rings={[
		{
			key: 'limit',
			label: m.limit(),
			percent: Number(memoryLimit?.value ?? 0),
			color: 'var(--chart-3)'
		},
		{
			key: 'request',
			label: m.request(),
			percent: Number(memoryRequest?.value ?? 0),
			color: 'var(--chart-2)'
		},
		{
			key: 'usage',
			label: m.usage(),
			percent: Number(memoryUsage?.value ?? 0),
			color: 'var(--chart-1)'
		}
	]}
/>

<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { CommitBars, NUM, Panel, widgetState } from '$lib/components/dashboard/kit';
	import { CAPACITY_THRESHOLDS } from '$lib/components/dashboard/kit/format';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { fetchCombinedInstantOrNull, LIVE_PODS } from '$lib/prometheus';

	import ScopeLabel from './scope-label.svelte';
	import { scopedSum } from './signals.svelte';

	let {
		prometheusDriver,
		isReloading = $bindable(),
		readyOnly = false
	}: {
		prometheusDriver: PrometheusDriver;
		isReloading: boolean;
		/** Count Ready nodes only: set while some node is not Ready (SPEC 3.4). */
		readyOnly?: boolean;
	} = $props();

	// Actual consumption (cAdvisor working set) over the same allocatable base as request/limit.
	let memoryUsage = $state<number>();
	// Reserved memory — what the scheduler checks; at 100% no new pod can be placed.
	let memoryRequest = $state<number>();
	// Memory limit ceiling — above 100% the cluster is over-committed (OOM/eviction risk).
	let memoryLimit = $state<number>();
	let allocatableMemory = $state<number>();
	let failed = $state(false);

	// All four scalars come back in a single HTTP request (one `or`-unioned instant query)
	// to keep Prometheus request fan-out low.
	async function fetch() {
		const allocatable = scopedSum(
			'kube_node_status_allocatable{resource="memory", unit="byte"}',
			readyOnly
		);
		const r = await fetchCombinedInstantOrNull(prometheusDriver, {
			usage: `100 * ${scopedSum('container_memory_working_set_bytes{container!=""}', readyOnly)} / ${allocatable}`,
			request: `100 * ${scopedSum(`kube_pod_container_resource_requests{resource="memory", unit="byte"} ${LIVE_PODS}`, readyOnly)} / ${allocatable}`,
			limit: `100 * ${scopedSum(`kube_pod_container_resource_limits{resource="memory", unit="byte"} ${LIVE_PODS}`, readyOnly)} / ${allocatable}`,
			allocatable
		});
		failed = r === null;
		if (!r) return;
		const pick = (key: string) => {
			const value = r[key][0]?.value?.value;
			return value === undefined ? undefined : Number(value);
		};
		memoryUsage = pick('usage');
		memoryRequest = pick('request');
		memoryLimit = pick('limit');
		allocatableMemory = pick('allocatable');
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	// The scope changes when a node drops out or comes back; fetch again at once.
	let lastScope: boolean | undefined;
	$effect(() => {
		const scope = readyOnly;
		if (lastScope !== undefined && lastScope !== scope) void fetch();
		lastScope = scope;
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

<Panel
	title={m.memory()}
	tooltip={m.cluster_dashboard_memory_tooltip()}
	state={widgetState(
		isLoaded,
		allocatableMemory !== undefined,
		failed && allocatableMemory === undefined
	)}
	class="min-h-58"
>
	{#snippet actions()}
		<ScopeLabel {readyOnly} />
	{/snippet}
	{@const total = formatCapacity(allocatableMemory ?? 0)}
	<p class="text-[1.75rem] leading-8 tracking-tight {NUM}">
		{total.value}<span class="ml-1.5 text-sm tracking-normal text-muted-foreground"
			>{m.cluster_allocatable_unit({ unit: total.unit })}</span
		>
	</p>
	<!-- Limit is neutral: summed limits past allocatable are ordinary, so its excess is hatched
	     but never coloured as a warning. -->
	<CommitBars
		class="mt-auto pt-3"
		thresholds={CAPACITY_THRESHOLDS}
		summary={false}
		rows={[
			{ label: m.usage(), value: memoryUsage },
			{ label: m.request(), value: memoryRequest },
			{ label: m.limit(), value: memoryLimit, colored: false }
		]}
	/>
</Panel>

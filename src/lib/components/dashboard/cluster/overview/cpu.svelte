<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { CommitBars, NUM, Panel, widgetState } from '$lib/components/dashboard/kit';
	import { CAPACITY_THRESHOLDS } from '$lib/components/dashboard/kit/format';
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

	// Actual consumption (cAdvisor) over the same allocatable base as request/limit, so the
	// three bars are directly comparable.
	let cpuUsage = $state<number>();
	// Reserved CPU — this is what the scheduler checks; at 100% no new pod can be placed.
	let cpuRequest = $state<number>();
	// CPU limit ceiling — above 100% the cluster is over-committed (throttling/eviction risk).
	let cpuLimit = $state<number>();
	let allocatableCPU = $state<number>();
	let failed = $state(false);

	// All four scalars come back in a single HTTP request (one `or`-unioned instant query)
	// to keep Prometheus request fan-out low.
	async function fetch() {
		const allocatable = scopedSum(
			'kube_node_status_allocatable{resource="cpu", unit="core"}',
			readyOnly
		);
		const r = await fetchCombinedInstantOrNull(prometheusDriver, {
			usage: `100 * ${scopedSum('irate(container_cpu_usage_seconds_total{container!=""}[2m])', readyOnly)} / ${allocatable}`,
			request: `100 * ${scopedSum(`kube_pod_container_resource_requests{resource="cpu", unit="core"} ${LIVE_PODS}`, readyOnly)} / ${allocatable}`,
			limit: `100 * ${scopedSum(`kube_pod_container_resource_limits{resource="cpu", unit="core"} ${LIVE_PODS}`, readyOnly)} / ${allocatable}`,
			allocatable
		});
		failed = r === null;
		if (!r) return;
		const pick = (key: string) => {
			const value = r[key][0]?.value?.value;
			return value === undefined ? undefined : Number(value);
		};
		cpuUsage = pick('usage');
		cpuRequest = pick('request');
		cpuLimit = pick('limit');
		allocatableCPU = pick('allocatable');
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
	title={m.cpu()}
	tooltip={m.cluster_dashboard_cpu_tooltip()}
	state={widgetState(
		isLoaded,
		allocatableCPU !== undefined,
		failed && allocatableCPU === undefined
	)}
	class="min-h-58"
>
	{#snippet actions()}
		<ScopeLabel {readyOnly} />
	{/snippet}
	<p class="text-[1.75rem] leading-8 tracking-tight {NUM}">
		{allocatableCPU !== undefined ? Math.round(allocatableCPU * 100) / 100 : '—'}<span
			class="ml-1.5 text-sm tracking-normal text-muted-foreground"
			>{m.cluster_cores_allocatable()}</span
		>
	</p>
	<!-- Limit is neutral: summed limits past allocatable are ordinary, so its excess is hatched
	     but never coloured as a warning. -->
	<CommitBars
		class="mt-auto pt-3"
		thresholds={CAPACITY_THRESHOLDS}
		summary={false}
		rows={[
			{ label: m.usage(), value: cpuUsage },
			{ label: m.request(), value: cpuRequest },
			{ label: m.limit(), value: cpuLimit, colored: false }
		]}
	/>
</Panel>

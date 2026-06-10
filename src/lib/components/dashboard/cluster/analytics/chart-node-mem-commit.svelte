<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	import AreaTimeSeries from './area-time-series.svelte';

	// cAdvisor + kube-state-metrics memory commitment for the selected node: Usage / Request /
	// Limit as a percentage of the node's allocatable memory. `nodeName` is the k8s node name.
	let {
		client,
		nodeName,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		nodeName: string | undefined;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	const buildQuery = () => {
		const n = escapePromqlStringLiteral(nodeName ?? '');
		const alloc = `sum(kube_node_status_allocatable{resource="memory",unit="byte",node="${n}"})`;
		// Keyed largest-to-smallest so the (typically smaller) Usage area paints on top.
		return {
			[m.limit()]: `sum(kube_pod_container_resource_limits{resource="memory",unit="byte",node="${n}"}) / ${alloc} * 100`,
			[m.request()]: `sum(kube_pod_container_resource_requests{resource="memory",unit="byte",node="${n}"}) / ${alloc} * 100`,
			[m.usage()]: `sum(container_memory_working_set_bytes{container!="",node="${n}"}) / ${alloc} * 100`
		};
	};
	const format = (value: number) => `${value.toFixed(1)}%`;
	// Semantic colours: the (large) Limit band stays calm/teal, Usage pops on top in orange.
	const colors = {
		[m.limit()]: 'var(--chart-2)',
		[m.request()]: 'var(--chart-3)',
		[m.usage()]: 'var(--chart-1)'
	};
</script>

<AreaTimeSeries
	{client}
	title={`${m.memory()} · ${m.commitment()}`}
	description={m.node_chart_mem_commit_description()}
	tooltip={m.node_chart_mem_commit_tooltip()}
	{buildQuery}
	{format}
	{colors}
	{start}
	{end}
	{endIsNow}
	bind:isReloading
/>

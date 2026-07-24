<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	import AreaTimeSeries from '../area-time-series.svelte';

	// Per-namespace scheduling commitment: actual Usage vs reserved Request vs Limit, over time.
	let {
		client,
		namespace,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		namespace: string | undefined;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	const ns = $derived(escapePromqlStringLiteral((namespace ?? '').trim()));

	const cpuQuery = () => ({
		[m.limit()]: `sum(kube_pod_container_resource_limits{namespace="${ns}",resource="cpu",unit="core"})`,
		[m.request()]: `sum(kube_pod_container_resource_requests{namespace="${ns}",resource="cpu",unit="core"})`,
		[m.usage()]: `sum(rate(container_cpu_usage_seconds_total{namespace="${ns}",container!=""}[2m]))`
	});
	const memQuery = () => ({
		[m.limit()]: `sum(kube_pod_container_resource_limits{namespace="${ns}",resource="memory",unit="byte"})`,
		[m.request()]: `sum(kube_pod_container_resource_requests{namespace="${ns}",resource="memory",unit="byte"})`,
		[m.usage()]: `sum(container_memory_working_set_bytes{namespace="${ns}",container!=""})`
	});

	const cpuFormat = (value: number) => `${value.toFixed(2)} cores`;
	const memFormat = (value: number) => {
		const { value: v, unit } = formatCapacity(value);
		return `${v.toLocaleString()} ${unit}`;
	};
	// Calm teal for the Limit band; Usage pops on top in orange.
	const colors = {
		[m.limit()]: 'var(--chart-2)',
		[m.request()]: 'var(--chart-3)',
		[m.usage()]: 'var(--chart-1)'
	};
</script>

<div class="grid w-full items-start gap-4 lg:grid-cols-2">
	<AreaTimeSeries
		{client}
		title={`${m.cpu()} · ${m.commitment()}`}
		description={m.ns_commit_cpu_description()}
		tooltip={m.ns_commit_cpu_tooltip()}
		buildQuery={cpuQuery}
		format={cpuFormat}
		{colors}
		{start}
		{end}
		{endIsNow}
		{isReloading}
	/>
	<AreaTimeSeries
		{client}
		title={`${m.memory()} · ${m.commitment()}`}
		description={m.ns_commit_mem_description()}
		tooltip={m.ns_commit_mem_tooltip()}
		buildQuery={memQuery}
		format={memFormat}
		{colors}
		{start}
		{end}
		{endIsNow}
		{isReloading}
	/>
</div>

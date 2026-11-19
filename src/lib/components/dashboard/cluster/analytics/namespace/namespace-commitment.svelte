<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, LIVE_PODS } from '$lib/prometheus';

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
		[m.limit()]: `sum(kube_pod_container_resource_limits{namespace="${ns}",resource="cpu",unit="core"} ${LIVE_PODS})`,
		[m.request()]: `sum(kube_pod_container_resource_requests{namespace="${ns}",resource="cpu",unit="core"} ${LIVE_PODS})`,
		[m.usage()]: `sum(rate(container_cpu_usage_seconds_total{namespace="${ns}",container!=""}[2m]))`
	});
	const memQuery = () => ({
		[m.limit()]: `sum(kube_pod_container_resource_limits{namespace="${ns}",resource="memory",unit="byte"} ${LIVE_PODS})`,
		[m.request()]: `sum(kube_pod_container_resource_requests{namespace="${ns}",resource="memory",unit="byte"} ${LIVE_PODS})`,
		[m.usage()]: `sum(container_memory_working_set_bytes{namespace="${ns}",container!=""})`
	});

	const cpuFormat = (value: number) => `${value.toFixed(2)} cores`;
	const memFormat = (value: number) => {
		const { value: v, unit } = formatCapacity(value);
		return `${v.toLocaleString()} ${unit}`;
	};
	const cpuAxisFormat = (value: number) => value.toFixed(value < 10 ? 1 : 0);
	// One blue ramp, told apart by lightness: Usage is the reading that matters and takes
	// --chart-1, the step furthest from the card in both themes; Request sits in the middle and
	// Limit, a ceiling rather than a measurement, takes the quietest step and a dashed line.
	const colors = {
		[m.limit()]: 'var(--chart-4)',
		[m.request()]: 'var(--chart-3)',
		[m.usage()]: 'var(--chart-1)'
	};
	const dashed = [m.limit()];
</script>

<div class="grid w-full items-stretch gap-5 lg:grid-cols-2">
	<AreaTimeSeries
		{client}
		title={`${m.cpu()} · ${m.commitment()}`}
		description={m.ns_commit_cpu_description()}
		tooltip={m.ns_commit_cpu_tooltip()}
		buildQuery={cpuQuery}
		format={cpuFormat}
		axisFormat={cpuAxisFormat}
		{colors}
		{dashed}
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
		{dashed}
		{start}
		{end}
		{endIsNow}
		{isReloading}
	/>
</div>

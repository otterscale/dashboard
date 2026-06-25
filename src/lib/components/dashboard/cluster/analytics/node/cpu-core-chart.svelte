<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { m } from '$lib/paraglide/messages';

	import AreaTimeSeries from '../area-time-series.svelte';

	let {
		client,
		fqdn,
		start,
		end,
		endIsNow,
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		fqdn: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		isReloading?: boolean;
	} = $props();

	// CPU time split by mode, as a percentage of all logical cores. Stacked, the bands sum to
	// the node's overall CPU utilisation — far clearer than one band per core.
	const buildQuery = () => {
		const cores = `scalar(count(count by (cpu)(node_cpu_seconds_total{instance=~"${fqdn}"})))`;
		return `100 * sum by (mode)(rate(node_cpu_seconds_total{instance=~"${fqdn}", mode!="idle"}[5m])) / ${cores}`;
	};
	const format = (value: number) => `${value.toFixed(1)}%`;
	// Calm teal for normal user work; iowait pops in orange (storage bottleneck signal).
	const colors = {
		user: 'var(--chart-2)',
		system: 'var(--chart-3)',
		iowait: 'var(--chart-1)',
		softirq: 'var(--chart-5)',
		steal: 'var(--chart-4)'
	};
</script>

<AreaTimeSeries
	{client}
	title={`${m.cpu()} · ${m.breakdown()}`}
	description={m.node_chart_cpu_core_description()}
	tooltip={m.node_chart_cpu_core_tooltip()}
	{buildQuery}
	{format}
	{colors}
	stacked
	{start}
	{end}
	{endIsNow}
	bind:isReloading
/>

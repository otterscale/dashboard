<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { formatIO } from '$lib/formatter';
	import { m } from '$lib/messages';

	import AreaTimeSeries from '../area-time-series.svelte';

	// Combined node network I/O: received and transmitted as overlapping areas.
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

	const buildQuery = () => ({
		[m.received()]: `sum(rate(node_network_receive_bytes_total{instance=~"${fqdn}", device!="lo"}[5m]))`,
		[m.transmitted()]: `sum(rate(node_network_transmit_bytes_total{instance=~"${fqdn}", device!="lo"}[5m]))`
	});
	const format = (value: number) => {
		const { value: v, unit } = formatIO(value);
		return `${v.toLocaleString()} ${unit}`;
	};
	const colors = {
		[m.received()]: 'var(--chart-2)',
		[m.transmitted()]: 'var(--chart-1)'
	};
</script>

<AreaTimeSeries
	{client}
	title={`${m.networking()} · I/O`}
	description={m.node_chart_network_io_description()}
	tooltip={m.node_chart_network_io_tooltip()}
	{buildQuery}
	{format}
	{colors}
	{start}
	{end}
	{endIsNow}
	bind:isReloading
/>

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

	const DEVICE = '(/dev/)?(mmcblk.p.+|nvme.+|rbd.+|sd.+|vd.+|xvd.+|dm-.+|dasd.+)';
	const buildQuery = () =>
		`sum(rate(node_disk_io_time_seconds_total{instance=~"${fqdn}", device=~"${DEVICE}"}[5m]))`;
	const format = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 2 });
</script>

<AreaTimeSeries
	{client}
	title={`${m.disk()} · IO ${m.time()}`}
	description={m.node_chart_disk_io_description()}
	tooltip={m.node_chart_disk_io_tooltip()}
	{buildQuery}
	{format}
	{start}
	{end}
	{endIsNow}
	bind:isReloading
/>

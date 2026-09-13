<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { formatIO } from '$lib/formatter';
	import { m } from '$lib/messages';

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
	const buildQuery = () => ({
		Read: `sum (rate(node_disk_read_bytes_total{instance=~"${fqdn}", device=~"${DEVICE}"}[5m]))`,
		Write: `sum (rate(node_disk_written_bytes_total{instance=~"${fqdn}", device=~"${DEVICE}"}[5m]))`
	});
	const format = (value: number) => {
		const { value: v, unit } = formatIO(value);
		return `${v.toLocaleString()} ${unit}`;
	};
</script>

<AreaTimeSeries
	{client}
	title={`${m.disk()} · ${m.read()}/${m.write()}`}
	description={m.node_chart_disk_rw_description()}
	tooltip={m.node_chart_disk_rw_tooltip()}
	{buildQuery}
	{format}
	{start}
	{end}
	{endIsNow}
	bind:isReloading
/>

<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { fetchInstant, type Sample, scalar } from '$lib/components/dashboard/kit/fetch';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { m } from '$lib/messages';

	import { osdLevel } from '../../overview/ceph';
	import { DASH, fmtBytes, fmtMs, fmtPct, LEVEL_TEXT } from '../../overview/format';
	import InfoCard, { type InfoRow } from '../info-card.svelte';
	import Kpi from '../kpi.svelte';
	import { cephName, fmtWhole } from '../lib/format';
	import { INFO_ALONE, KPI_GRID } from '../lib/layout';
	import { diskModel, manyPgs, type OsdCluster, type OsdItem, slowWrites } from '../lib/model';
	import { osdDeviceQueries } from '../lib/queries';

	// The picked OSD now: how full it is against the cluster's ratios, its share of placement
	// groups, its latency beside the cluster's, and its traffic; then the disk under it.
	let {
		client,
		tick,
		osd,
		cluster,
		state: listState
	}: {
		client: PrometheusDriver;
		tick: number;
		osd: OsdItem | undefined;
		cluster: OsdCluster;
		state: WidgetState;
	} = $props();

	type Device = { disk?: Sample; hosts: Sample[]; models: Sample[]; slowOps?: number };
	const id = $derived(osd?.id);
	const device = new Loader<Device>(async () => {
		if (id === undefined) return null;
		const r = await fetchInstant(client, osdDeviceQueries(id));
		if (!r) return null;
		return { disk: r.disk[0], hosts: r.hosts, models: r.models, slowOps: scalar(r.slowOps) };
	});
	$effect(() => {
		void tick;
		if (id === undefined) return;
		untrack(() => device.load());
	});

	const ready = $derived(listState === 'ready' && osd ? 'ready' : listState);
	const nearfullPct = $derived(cluster.nearfull === undefined ? undefined : cluster.nearfull * 100);
	const level = $derived(
		osd?.pct !== undefined && cluster.nearfull !== undefined && cluster.full !== undefined
			? osdLevel(osd.pct, cluster.nearfull, cluster.full)
			: undefined
	);
	const ops = $derived(
		osd?.readOps === undefined && osd?.writeOps === undefined
			? undefined
			: (osd?.readOps ?? 0) + (osd?.writeOps ?? 0)
	);

	const labels = [
		m.storage_an_host(),
		m.storage_an_status(),
		m.storage_an_device(),
		m.storage_an_model(),
		m.storage_an_device_class(),
		m.storage_an_store(),
		m.storage_an_slow_ops_24h()
	];
	const rows = $derived.by((): InfoRow[] => {
		if (!osd) return [];
		const d = device.data;
		const path = d?.disk?.labels.device;
		const status = [
			osd.up === undefined ? undefined : osd.up ? 'up' : 'down',
			osd.in === undefined ? undefined : osd.in ? 'in' : 'out'
		]
			.filter(Boolean)
			.join(' · ');
		return [
			{ label: m.storage_an_host(), value: osd.host ?? DASH, mono: true },
			{ label: m.storage_an_status(), value: status || DASH, mono: true },
			{ label: m.storage_an_device(), value: path ?? DASH, mono: true },
			{
				label: m.storage_an_model(),
				value: diskModel(path, osd.host, d?.hosts, d?.models) ?? DASH,
				mono: true
			},
			{ label: m.storage_an_device_class(), value: cephName(osd.deviceClass), mono: true },
			{ label: m.storage_an_store(), value: cephName(osd.store), mono: true },
			{ label: m.storage_an_slow_ops_24h(), value: fmtWhole(d?.slowOps), mono: true }
		];
	});
	// The device facts wait for their own query; the rest are known with the list.
	const infoState = $derived(ready === 'ready' && device.state === 'loading' ? 'loading' : ready);
</script>

<div class={KPI_GRID[5]}>
	<Kpi
		label={m.storage_col_used()}
		state={ready}
		value={fmtPct(osd?.pct)}
		tone={level ? LEVEL_TEXT[level] : undefined}
		bar={osd?.pct ?? 0}
		mark={nearfullPct}
		note={m.storage_an_osd_used_note({
			used: fmtBytes(osd?.used),
			total: fmtBytes(osd?.total),
			pct: fmtPct(nearfullPct)
		})}
	/>
	<Kpi
		label={m.storage_pgs()}
		state={ready}
		value={fmtWhole(osd?.pgs)}
		tone={manyPgs(osd?.pgs, cluster.avgPgs) ? 'text-chart-1' : ''}
		note={m.storage_an_pg_avg({ avg: fmtWhole(cluster.avgPgs) })}
	/>
	<Kpi
		label={m.storage_an_read_p95()}
		state={ready}
		value={fmtMs(osd?.readP95)}
		note={m.storage_an_cluster_p95({ value: fmtMs(cluster.readP95) })}
		tooltip={m.storage_an_p95_tooltip()}
	/>
	<Kpi
		label={m.storage_an_write_p95()}
		state={ready}
		value={fmtMs(osd?.writeP95)}
		tone={slowWrites(osd?.writeP95, cluster.writeP95) ? 'text-chart-1' : ''}
		note={m.storage_an_cluster_p95({ value: fmtMs(cluster.writeP95) })}
		tooltip={m.storage_an_p95_tooltip()}
	/>
	<Kpi
		label={m.storage_operations()}
		state={ready}
		value={fmtWhole(ops)}
		note={m.storage_an_ops_note({ read: fmtWhole(osd?.readOps), write: fmtWhole(osd?.writeOps) })}
	/>

	<InfoCard title={m.storage_an_device()} {rows} state={infoState} {labels} class={INFO_ALONE[5]} />
</div>

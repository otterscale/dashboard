<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { fetchInstant, scalar } from '$lib/components/dashboard/kit/fetch';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { m } from '$lib/messages';

	import { FULL_IN_WARN_DAYS, rawLevel } from '../../overview/ceph';
	import {
		DASH,
		fmtBytes,
		fmtCopies,
		fmtFullIn,
		fmtPct,
		fmtRate,
		LEVEL_TEXT,
		serviceLabel
	} from '../../overview/format';
	import InfoCard, { type InfoRow } from '../info-card.svelte';
	import Kpi from '../kpi.svelte';
	import { cephName, fmtGrowthAmount, fmtWhole } from '../lib/format';
	import { INFO_ALONE, INFO_BESIDE_TABLE, KPI_GRID, TABLE_SPAN } from '../lib/layout';
	import type { PoolItem, PvcItem } from '../lib/model';
	import { poolRateQueries } from '../lib/queries';
	import PvcTable from './pvc-table.svelte';

	// The picked pool now: how much it holds, how full it is and when it fills, and its traffic;
	// then its configuration and the PVCs whose data it holds.
	let {
		client,
		tick,
		pool,
		state: listState,
		deviceClass,
		pvcs,
		pvcState,
		workspaceOf
	}: {
		client: PrometheusDriver;
		tick: number;
		pool: PoolItem | undefined;
		/** The pool list's state; the numbers that come from it share it. */
		state: WidgetState;
		deviceClass: string | undefined;
		pvcs: PvcItem[];
		pvcState: WidgetState;
		workspaceOf: (namespace: string) => string;
	} = $props();

	type Rates = { readOps?: number; writeOps?: number; readBytes?: number; writeBytes?: number };
	const poolId = $derived(pool?.id);
	const rates = new Loader<Rates>(
		async () => {
			if (poolId === undefined) return null;
			const r = await fetchInstant(client, poolRateQueries(poolId));
			if (!r) return null;
			return {
				readOps: scalar(r.readOps),
				writeOps: scalar(r.writeOps),
				readBytes: scalar(r.readBytes),
				writeBytes: scalar(r.writeBytes)
			};
		},
		(d) => d.readOps === undefined && d.writeOps === undefined
	);
	$effect(() => {
		void tick;
		if (poolId === undefined) return;
		untrack(() => rates.load());
	});

	const sum = (a?: number, b?: number) =>
		a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
	const r = $derived(rates.data ?? {});
	const ready = $derived(listState === 'ready' && pool ? 'ready' : listState);

	const fullInNote = $derived.by(() => {
		if (!pool?.growth) return m.storage_an_no_history();
		if (pool.growth.kind === 'flat') return m.storage_an_no_growth();
		return m.storage_an_per_day_avg({ value: fmtGrowthAmount(pool.growth) });
	});

	// A pool that holds PVCs (RBD, CephFS data) keeps the table's room while they load.
	const holdsPvcs = $derived(pool?.service === 'rbd' || pool?.service === 'cephfs-data');
	const showTable = $derived(pvcs.length > 0 || (holdsPvcs && pvcState === 'loading'));

	const configLabels = [
		m.storage_col_service(),
		m.storage_an_replicas(),
		m.storage_pgs(),
		m.storage_an_compression(),
		m.storage_an_device_class()
	];
	const config = $derived.by((): InfoRow[] => {
		if (!pool) return [];
		return [
			{ label: m.storage_col_service(), value: serviceLabel(pool.service), mono: true },
			{
				label: m.storage_an_replicas(),
				value: pool.copiesLabel?.startsWith('EC')
					? pool.copiesLabel
					: pool.copies !== undefined
						? String(pool.copies)
						: DASH,
				mono: true
			},
			{ label: m.storage_pgs(), value: fmtWhole(pool.pgs), mono: true },
			{ label: m.storage_an_compression(), value: pool.compression || DASH, mono: true },
			{ label: m.storage_an_device_class(), value: cephName(deviceClass), mono: true }
		];
	});
</script>

<div class={KPI_GRID[5]}>
	<Kpi
		label={m.storage_an_stored()}
		state={ready}
		value={fmtBytes(pool?.stored)}
		note={pool?.storedRaw !== undefined && pool.copies !== undefined
			? m.storage_an_stored_raw({
					raw: fmtBytes(pool.storedRaw),
					copies: fmtCopies(pool.copies, pool.copiesLabel)
				})
			: DASH}
	/>
	<Kpi
		label={m.storage_col_used()}
		state={ready}
		value={fmtPct(pool?.usedPct)}
		tone={pool ? LEVEL_TEXT[rawLevel(pool.usedPct)] : undefined}
		bar={pool?.usedPct ?? 0}
		note={m.storage_an_max_avail({ value: fmtBytes(pool?.maxAvail) })}
	/>
	<Kpi
		label={m.storage_col_full_in()}
		state={ready}
		value={pool?.fullIn !== undefined ? fmtFullIn(pool.fullIn) : m.storage_an_not_filling()}
		tone={pool?.fullIn !== undefined && pool.fullIn < FULL_IN_WARN_DAYS
			? 'text-chart-1'
			: undefined}
		note={fullInNote}
	/>
	<Kpi
		label={m.storage_operations()}
		state={pool ? rates.state : ready}
		value={fmtWhole(sum(r.readOps, r.writeOps))}
		note={m.storage_an_ops_note({ read: fmtWhole(r.readOps), write: fmtWhole(r.writeOps) })}
	/>
	<Kpi
		label={m.storage_an_throughput()}
		state={pool ? rates.state : ready}
		value={fmtRate(sum(r.readBytes, r.writeBytes))}
		note={m.storage_an_rw_note({ read: fmtRate(r.readBytes), write: fmtRate(r.writeBytes) })}
	/>

	<InfoCard
		title={m.storage_an_configuration()}
		rows={config}
		state={ready}
		labels={configLabels}
		class={showTable ? INFO_BESIDE_TABLE : INFO_ALONE[5]}
	/>
	{#if showTable}
		<PvcTable {pvcs} state={pvcState} {workspaceOf} class={TABLE_SPAN[5]} />
	{/if}
</div>

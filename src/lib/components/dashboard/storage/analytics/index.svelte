<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onMount, untrack } from 'svelte';

	import { page } from '$app/state';
	import { fetchInstant } from '$lib/components/dashboard/cluster/analytics/lib/fetch';
	import { Loader } from '$lib/components/dashboard/cluster/analytics/lib/loader.svelte';
	import RankingCard, {
		type RankRow
	} from '$lib/components/dashboard/cluster/analytics/ranking-card.svelte';
	import { m } from '$lib/messages';

	import { FULL_IN_WARN_DAYS, osdLevel, rawLevel } from '../overview/ceph';
	import {
		DASH,
		fmtBytes,
		fmtCopies,
		fmtFullIn,
		fmtMs,
		fmtPct,
		LEVEL_TEXT,
		serviceLabel
	} from '../overview/format';
	import Heading from './heading.svelte';
	import OsdHistory from './history/osd-history.svelte';
	import PoolHistory from './history/pool-history.svelte';
	import PvcHistory from './history/pvc-history.svelte';
	import { cephName, fmtAgo, fmtGrowth } from './lib/format';
	import {
		buildOsds,
		buildPools,
		buildPvcs,
		type Dim,
		notMounted,
		type OsdCluster,
		type OsdItem,
		type PoolItem,
		PVC_FULL_IN_WARN_DAYS,
		type PvcItem,
		pvcLevel,
		slowWrites,
		soleDeviceClass
	} from './lib/model';
	import { OSD_DATA, POOL_DATA, PVC_DATA } from './lib/queries';
	import OsdNow from './now/osd-now.svelte';
	import PoolNow from './now/pool-now.svelte';
	import PvcNow from './now/pvc-now.svelte';

	// The Analytics tab. Top to bottom: a ranking of pools, OSDs or PVCs that is also the picker,
	// then the picked one, as it is now or over the chosen window.
	let {
		client,
		dim = $bindable(),
		selected = $bindable(),
		history,
		start,
		end,
		windowLabel,
		tick
	}: {
		client: PrometheusDriver;
		dim: Dim;
		/** The picked pool (by name), OSD (`osd.N`) and PVC (`namespace/name`), one per view. */
		selected: Record<Dim, string | undefined>;
		history: boolean;
		start: Date;
		end: Date;
		/** "Last 7 days", or the fixed span, under the History charts' titles. */
		windowLabel: string;
		/** Bumped by the page's Auto update timer and by ↻; the lists and Now cards refetch on it. */
		tick: number;
	} = $props();

	// namespace → workspace (a Workspace owns one namespace through `spec.namespace`).
	let namespaceToWorkspace = $state<Record<string, string>>({});
	const transport = getContext<Transport>('transport');
	onMount(() => {
		createClient(ResourceService, transport)
			.list({
				cluster: page.params.cluster ?? '',
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				namespace: ''
			})
			.then((response) => {
				const map: Record<string, string> = {};
				for (const item of response.items) {
					const obj = item.object as Record<string, unknown> | undefined;
					const name = (obj?.metadata as Record<string, unknown> | undefined)?.name;
					const ns = (obj?.spec as Record<string, unknown> | undefined)?.namespace;
					if (typeof name === 'string' && typeof ns === 'string' && name && ns) map[ns] = name;
				}
				namespaceToWorkspace = map;
			})
			.catch((error) => console.error('Failed to list workspaces:', error));
	});
	const workspaceOf = (namespace: string) => namespaceToWorkspace[namespace] ?? namespace;

	// One list per view, fetched when that view shows. Pools' Now also lists the PVCs in a pool.
	const pools = new Loader<{ pools: PoolItem[]; deviceClass?: string }>(
		async () => {
			const r = await fetchInstant(client, POOL_DATA);
			return r && { pools: buildPools(r), deviceClass: soleDeviceClass(r.osdClasses) };
		},
		(d) => d.pools.length === 0
	);
	const osds = new Loader<{ osds: OsdItem[]; cluster: OsdCluster }>(
		async () => {
			const r = await fetchInstant(client, OSD_DATA);
			return r && buildOsds(r);
		},
		(d) => d.osds.length === 0
	);
	const pvcs = new Loader<PvcItem[]>(
		async () => {
			const r = await fetchInstant(client, PVC_DATA);
			return r && buildPvcs(r);
		},
		(d) => d.length === 0
	);
	$effect(() => {
		void tick;
		const view = dim;
		const withPvcs = view === 'pvc' || (view === 'pool' && !history);
		untrack(() => {
			if (view === 'pool') void pools.load();
			if (view === 'osd') void osds.load();
			if (withPvcs) void pvcs.load();
		});
	});

	const poolList = $derived(pools.data?.pools ?? []);
	const osdList = $derived(osds.data?.osds ?? []);
	const osdCluster = $derived(osds.data?.cluster ?? {});
	const pvcList = $derived(pvcs.data ?? []);

	// ─── Ranking rows ────────────────────────────────────────────────────────────────────────
	const poolRows = $derived(
		poolList.map(
			(p, i): RankRow => ({
				id: p.name,
				label: p.name,
				chips: [serviceLabel(p.service)],
				bar: { solid: Math.max(0.6, p.usedPct) },
				values: [
					{ text: fmtBytes(p.stored) },
					{ text: fmtPct(p.usedPct), class: LEVEL_TEXT[rawLevel(p.usedPct)] },
					{
						text: fmtFullIn(p.fullIn),
						class:
							p.fullIn !== undefined && p.fullIn < FULL_IN_WARN_DAYS
								? 'text-chart-1'
								: 'text-muted-foreground',
						minor: true
					}
				],
				sortKey: i
			})
		)
	);
	const nearfullPct = $derived(
		osdCluster.nearfull === undefined ? undefined : osdCluster.nearfull * 100
	);
	const osdRows = $derived(
		osdList.map((o, i): RankRow => {
			const level =
				o.pct !== undefined && osdCluster.nearfull !== undefined && osdCluster.full !== undefined
					? osdLevel(o.pct, osdCluster.nearfull, osdCluster.full)
					: undefined;
			return {
				id: o.id,
				label: o.id,
				chips: o.host ? [o.host] : [],
				bar: { solid: Math.max(0.6, o.pct ?? 0), mark: nearfullPct },
				values: [
					{ text: fmtPct(o.pct), class: level ? LEVEL_TEXT[level] : undefined },
					{ text: fmtMs(o.readP95) },
					{
						text: fmtMs(o.writeP95),
						class: slowWrites(o.writeP95, osdCluster.writeP95) ? 'text-chart-1' : undefined,
						minor: true
					}
				],
				sortKey: i
			};
		})
	);
	const pvcRows = $derived(
		pvcList.map((p, i): RankRow => {
			const base = {
				id: p.key,
				label: p.name,
				chips: [workspaceOf(p.namespace)],
				sortKey: i
			};
			if (p.used === undefined) {
				return {
					...base,
					title: m.storage_an_never_reported(),
					note: m.storage_an_never_reported(),
					values: []
				};
			}
			return {
				...base,
				title: notMounted(p)
					? `${p.name} · ${m.storage_an_not_mounted({ ago: fmtAgo(p.lastSeenAgo ?? 0) })}`
					: undefined,
				bar: { solid: Math.max(0.6, p.pct ?? 0) },
				values: [
					{
						text: fmtPct(p.pct),
						class: p.pct !== undefined ? LEVEL_TEXT[pvcLevel(p.pct)] : undefined
					},
					{ text: p.live ? fmtGrowth(p.growth) : DASH },
					{
						text: fmtFullIn(p.fullIn),
						class:
							p.fullIn !== undefined && p.fullIn < PVC_FULL_IN_WARN_DAYS
								? 'text-chart-1'
								: 'text-muted-foreground',
						minor: true
					}
				]
			};
		})
	);

	const view = $derived.by(() => {
		if (dim === 'pool') {
			return {
				rows: poolRows,
				state: pools.state,
				subtitle: m.storage_an_sub_pool(),
				headers: [
					{ text: m.storage_col_stored() },
					{ text: m.storage_col_used() },
					{ text: m.storage_col_full_in(), minor: true }
				],
				showAll: (count: string) => m.storage_an_show_all_pools({ count })
			};
		}
		if (dim === 'osd') {
			return {
				rows: osdRows,
				state: osds.state,
				subtitle:
					osdCluster.nearfull !== undefined && osdCluster.full !== undefined
						? m.storage_an_sub_osd({
								nearfull: fmtPct(osdCluster.nearfull * 100),
								full: fmtPct(osdCluster.full * 100)
							})
						: m.storage_an_sub_osd_plain(),
				headers: [
					{ text: m.storage_col_used() },
					{ text: m.storage_an_col_read_p95() },
					{ text: m.storage_an_col_write_p95(), minor: true }
				],
				showAll: (count: string) => m.storage_an_show_all_osds({ count })
			};
		}
		return {
			rows: pvcRows,
			state: pvcs.state,
			subtitle: m.storage_an_sub_pvc(),
			headers: [
				{ text: m.storage_col_used() },
				{ text: m.storage_col_growth() },
				{ text: m.storage_col_full_in(), minor: true }
			],
			showAll: (count: string) => m.storage_an_show_all_pvcs({ count })
		};
	});

	// A pick that is not in the list (gone, or from an old link) falls back to the first row.
	$effect(() => {
		const ids = view.rows.map((row) => row.id);
		const current = untrack(() => selected[dim]);
		if (ids.length > 0 && (!current || !ids.includes(current))) selected[dim] = ids[0];
	});

	const pool = $derived(poolList.find((p) => p.name === selected.pool));
	const osd = $derived(osdList.find((o) => o.id === selected.osd));
	const pvc = $derived(pvcList.find((p) => p.key === selected.pvc));
	const poolPvcs = $derived(pool ? pvcList.filter((p) => p.poolId === pool.id) : []);

	const heading = $derived.by(() => {
		if (dim === 'pool') {
			return {
				kind: m.storage_an_kind_pool(),
				name: pool?.name,
				chip: pool ? serviceLabel(pool.service) : undefined,
				line:
					pool?.copies !== undefined && pool.pgs !== undefined
						? m.storage_an_pool_line({
								copies: fmtCopies(pool.copies, pool.copiesLabel),
								count: String(pool.pgs)
							})
						: undefined,
				loading: pools.state === 'loading'
			};
		}
		if (dim === 'osd') {
			return {
				kind: m.storage_an_kind_osd(),
				name: osd?.id,
				chip: osd?.host,
				line: osd
					? [cephName(osd.deviceClass), fmtBytes(osd.total), cephName(osd.store)].join(' · ')
					: undefined,
				loading: osds.state === 'loading'
			};
		}
		return {
			kind: m.storage_an_kind_pvc(),
			name: pvc?.name,
			chip: pvc ? workspaceOf(pvc.namespace) : undefined,
			line: pvc ? [pvc.storageClass, ...pvc.accessModes].join(' · ') : undefined,
			note: !pvc
				? undefined
				: pvc.used === undefined
					? m.storage_an_never_reported()
					: notMounted(pvc)
						? m.storage_an_not_mounted({ ago: fmtAgo(pvc.lastSeenAgo ?? 0) })
						: undefined,
			loading: pvcs.state === 'loading'
		};
	});

	const rangeKey = $derived(`${start.getTime()}-${end.getTime()}`);
	const noRows = $derived(view.state !== 'loading' && view.rows.length === 0);
</script>

<div class="flex flex-col gap-2 @md:gap-3">
	<RankingCard
		title={m.storage_an_ranking()}
		subtitle={view.subtitle}
		bind:metric={dim}
		metrics={[
			{ value: 'pool', label: m.storage_an_dim_pools() },
			{ value: 'osd', label: m.storage_an_dim_osds() },
			{ value: 'pvc', label: m.storage_an_dim_pvcs() }
		]}
		axisLabel={m.storage_an_col_name()}
		headers={view.headers}
		rows={view.rows}
		state={view.state}
		selected={selected[dim]}
		onSelect={(id) => (selected[dim] = id)}
		history={false}
		limit={view.rows.length > 12 ? 10 : undefined}
		showAllLabel={view.showAll}
		valueWidth="auto-cols-[4.25rem] @md:auto-cols-[6.5rem]"
		barFrom="5xl"
	/>

	{#if !noRows}
		<Heading {...heading} />
		{#if dim === 'pool'}
			{#key selected.pool}
				{#if history}
					{#key rangeKey}
						<PoolHistory
							{client}
							poolId={pool?.id}
							state={pools.state}
							{start}
							{end}
							{windowLabel}
						/>
					{/key}
				{:else}
					<PoolNow
						{client}
						{tick}
						{pool}
						state={pools.state}
						deviceClass={pools.data?.deviceClass}
						pvcs={poolPvcs}
						pvcState={pvcs.state}
						{workspaceOf}
					/>
				{/if}
			{/key}
		{:else if dim === 'osd'}
			{#key selected.osd}
				{#if history}
					{#key rangeKey}
						<OsdHistory
							{client}
							osd={osd?.id}
							cluster={osdCluster}
							osdCount={osdList.length}
							state={osds.state}
							{start}
							{end}
							{windowLabel}
						/>
					{/key}
				{:else}
					<OsdNow {client} {tick} {osd} cluster={osdCluster} state={osds.state} />
				{/if}
			{/key}
		{:else}
			{#key selected.pvc}
				{#if history}
					{#key rangeKey}
						<PvcHistory {client} {pvc} state={pvcs.state} {start} {end} {windowLabel} />
					{/key}
				{:else}
					<PvcNow
						{pvc}
						state={pvcs.state}
						workspace={pvc ? namespaceToWorkspace[pvc.namespace] : undefined}
					/>
				{/if}
			{/key}
		{/if}
	{/if}
</div>

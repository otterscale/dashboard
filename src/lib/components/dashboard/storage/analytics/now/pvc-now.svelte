<script lang="ts">
	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';

	import { DASH, fmtBytes, fmtFullIn, fmtPct, LEVEL_TEXT } from '../../overview/format';
	import InfoCard, { type InfoRow } from '../info-card.svelte';
	import Kpi from '../kpi.svelte';
	import { fmtDate, fmtGrowthAmount, fmtWhole } from '../lib/format';
	import { INFO_ALONE, KPI_GRID } from '../lib/layout';
	import { filesLevel, filesOf, PVC_FULL_IN_WARN_DAYS, type PvcItem, pvcLevel } from '../lib/model';

	// The picked PVC now: how full it is, how fast it grows and when it fills, and how many files
	// it holds; then the volume behind it. Everything comes with the PVC list, so no query here.
	let {
		pvc,
		state: listState,
		workspace
	}: {
		pvc: PvcItem | undefined;
		state: WidgetState;
		/** The workspace that owns the PVC's namespace, if one does. */
		workspace: string | undefined;
	} = $props();

	const ready = $derived(listState === 'ready' && pvc ? 'ready' : listState);
	const cephfs = $derived(/filesystem|cephfs/i.test(pvc?.storageClass ?? ''));
	const files = $derived(pvc ? filesOf(pvc) : { kind: 'none' as const });

	const growthKpi = $derived.by(() => {
		if (!pvc) return { value: DASH, note: '' };
		if (!pvc.live) return { value: DASH, note: m.storage_an_not_growing_unmounted() };
		if (!pvc.growth) return { value: DASH, note: m.storage_an_no_history() };
		if (pvc.growth.kind === 'flat') {
			return { value: m.storage_growth_flat(), note: m.storage_an_no_growth() };
		}
		return { value: fmtGrowthAmount(pvc.growth), note: m.storage_an_per_day_note() };
	});
	const fullInKpi = $derived.by(() => {
		if (!pvc || pvc.fullIn === undefined) {
			return {
				value: m.storage_an_not_filling(),
				note: !pvc?.live ? m.storage_an_not_growing_unmounted() : m.storage_an_no_growth()
			};
		}
		return { value: fmtFullIn(pvc.fullIn), note: m.storage_an_at_current_growth() };
	});

	const labels = [
		m.storage_an_col_workspace(),
		m.storage_an_namespace(),
		m.storage_an_storage_class(),
		m.storage_col_pool(),
		m.storage_an_access_mode(),
		m.storage_an_mounted_by(),
		m.storage_an_created()
	];
	const rows = $derived.by((): InfoRow[] => {
		if (!pvc) return [];
		const mounted = pvc.mountedBy.join(', ');
		return [
			{ label: m.storage_an_col_workspace(), value: workspace ?? DASH, mono: true },
			{ label: m.storage_an_namespace(), value: pvc.namespace, mono: true },
			{ label: m.storage_an_storage_class(), value: pvc.storageClass, mono: true },
			{ label: m.storage_col_pool(), value: pvc.poolName ?? DASH, mono: true },
			{
				label: m.storage_an_access_mode(),
				value: pvc.accessModes.join(', ') || DASH,
				mono: true
			},
			{
				label: m.storage_an_mounted_by(),
				value: mounted || m.storage_an_none_mounted(),
				mono: mounted !== ''
			},
			{ label: m.storage_an_created(), value: fmtDate(pvc.created), mono: true }
		];
	});
</script>

<div class={KPI_GRID[4]}>
	<Kpi
		label={m.storage_col_used()}
		state={ready === 'ready' && pvc?.pct === undefined ? 'empty' : ready}
		value={fmtPct(pvc?.pct)}
		tone={pvc?.pct !== undefined ? LEVEL_TEXT[pvcLevel(pvc.pct)] : undefined}
		bar={pvc?.pct ?? 0}
		note={m.storage_an_of({ used: fmtBytes(pvc?.used), total: fmtBytes(pvc?.capacity) })}
	/>
	<Kpi label={m.storage_col_growth()} state={ready} value={growthKpi.value} note={growthKpi.note} />
	<Kpi
		label={m.storage_col_full_in()}
		state={ready}
		value={fullInKpi.value}
		tone={pvc?.fullIn !== undefined && pvc.fullIn < PVC_FULL_IN_WARN_DAYS
			? 'text-chart-1'
			: undefined}
		note={fullInKpi.note}
	/>
	<Kpi
		label={m.storage_an_files()}
		state={ready}
		value={files.kind === 'count' ? fmtWhole(files.used) : DASH}
		tone={files.kind === 'count' && files.pct !== undefined && filesLevel(files.pct) !== 'green'
			? LEVEL_TEXT[filesLevel(files.pct)]
			: undefined}
		note={files.kind === 'count'
			? files.total !== undefined && files.pct !== undefined
				? m.storage_an_files_note({ pct: fmtPct(files.pct), total: fmtWhole(files.total) })
				: m.storage_an_files_used()
			: cephfs
				? m.storage_an_files_cephfs()
				: m.storage_an_files_none()}
	/>

	<InfoCard title={m.storage_an_volume()} {rows} state={ready} {labels} class={INFO_ALONE[4]} />
</div>

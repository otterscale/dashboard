<script lang="ts">
	import { TONE_TEXT, type WidgetState } from '$lib/components/dashboard/kit';
	import { fmt, fmtCores, fmtGiB, fmtPct } from '$lib/components/dashboard/kit/format';
	import RankingCard, { type RankRow } from '$lib/components/dashboard/kit/ranking-card.svelte';
	import { m } from '$lib/messages';

	import { kindLabel } from './lib/labels';
	import {
		barScale,
		barShares,
		type Entry,
		hasQuota,
		type Quota,
		rankEntries,
		type RankMetric,
		type Totals,
		WORKSPACE_ID
	} from './lib/model';

	// The ranking that is also the picker: the whole workspace first, then every workload.
	let {
		rows,
		metric = $bindable(),
		quota,
		state,
		selected,
		onSelect,
		history,
		windowLabel,
		trends
	}: {
		rows: { entry: Entry; totals: Totals }[];
		metric: RankMetric;
		quota: Quota;
		state: WidgetState;
		selected: string;
		onSelect: (id: string) => void;
		history: boolean;
		windowLabel: string;
		/** The selected metric's line per row, for History's trend column. */
		trends: Map<string, number[]>;
	} = $props();

	const workspace = $derived(rows.find((row) => row.entry.id === WORKSPACE_ID));
	const scale = $derived(
		workspace
			? barScale(
					metric,
					workspace.totals,
					rows.map((row) => row.totals),
					quota
				)
			: 0
	);

	const chip = (entry: Entry) =>
		entry.kind === 'workspace' ? m.ws_analytics_chip_whole() : kindLabel(entry);

	const STATE_CLASS = {
		failing: TONE_TEXT.bad,
		starting: TONE_TEXT.warn,
		ready: TONE_TEXT.ok
	};

	function status(entry: Entry): string {
		if (entry.kind !== 'workspace') {
			return entry.state === 'failing'
				? m.ws_analytics_failing()
				: entry.state === 'starting'
					? m.workspace_workload_starting()
					: m.ready();
		}
		const count = (state: Entry['state']) =>
			String(rows.filter((r) => r.entry.kind !== 'workspace' && r.entry.state === state).length);
		return entry.state === 'failing'
			? m.ws_analytics_n_failing({ count: count('failing') })
			: entry.state === 'starting'
				? m.ws_analytics_n_starting({ count: count('starting') })
				: m.ws_analytics_all_ready();
	}

	function toRow({ entry, totals }: { entry: Entry; totals: Totals }): RankRow {
		const base = {
			id: entry.id,
			label: entry.name,
			rank: entry.id === WORKSPACE_ID ? '—' : undefined,
			chips: [chip(entry)],
			trend: trends.get(entry.id),
			sortKey: 0
		};
		const bar = barShares(metric, totals, scale);
		if (metric === 'cpu' || metric === 'memory') {
			const show = metric === 'cpu' ? fmtCores : fmtGiB;
			const t = totals[metric];
			return {
				...base,
				bar,
				values: [
					{ text: show(t.used) },
					{ text: show(t.requested), minor: true },
					{ text: show(t.limit), class: 'text-muted-foreground', minor: true }
				]
			};
		}
		if (metric === 'gpu') {
			if (!totals.gpu || !bar) return { ...base, note: m.analytics_no_gpu(), values: [] };
			return {
				...base,
				bar,
				values: [
					{ text: fmtPct(totals.gpu.util) },
					{ text: fmtGiB(totals.gpu.used), minor: true },
					{ text: fmtGiB(totals.gpu.allocated), minor: true }
				]
			};
		}
		return {
			...base,
			bar,
			values: [
				{ text: fmt(totals.restarts), class: totals.restarts > 0 ? 'text-chart-1' : undefined },
				{ text: `${fmt(totals.podsReady)} / ${fmt(totals.podsTotal)}`, minor: true },
				{ text: status(entry), class: STATE_CLASS[entry.state], minor: true }
			]
		};
	}

	const ranked = $derived(rankEntries(rows, metric).map(toRow));

	const headers = $derived(
		metric === 'gpu'
			? [
					{ text: m.analytics_util() },
					{ text: m.ws_analytics_used(), minor: true },
					{ text: m.analytics_allocated(), minor: true }
				]
			: metric === 'restarts'
				? [
						{ text: m.analytics_restarts() },
						{ text: m.ws_analytics_pods_ready(), minor: true },
						{ text: m.status(), minor: true }
					]
				: [
						{ text: m.ws_analytics_used() },
						{ text: m.ws_analytics_requested(), minor: true },
						{ text: m.analytics_limit(), minor: true }
					]
	);
	const legend = $derived<[string, string?] | undefined>(
		metric === 'restarts'
			? undefined
			: [
					m.ws_analytics_in_use(),
					metric === 'gpu' ? m.analytics_allocated() : m.ws_analytics_requested()
				]
	);
	const subtitle = $derived(
		[
			metric === 'restarts'
				? history
					? m.ws_analytics_over_window({ window: windowLabel })
					: m.ws_analytics_last_24h()
				: history && metric !== 'gpu'
					? m.ws_analytics_average_over({ window: windowLabel })
					: m.ws_analytics_now(),
			metric === 'cpu'
				? m.ws_analytics_sorted_cpu()
				: metric === 'memory'
					? m.ws_analytics_sorted_memory()
					: metric === 'gpu'
						? m.ws_analytics_sorted_gpu()
						: m.ws_analytics_sorted_restarts(),
			hasQuota(quota, metric) ? m.ws_analytics_quota_bars() : '',
			m.ws_analytics_select_row()
		]
			.filter(Boolean)
			.join(' ')
	);
</script>

<RankingCard
	title={m.ws_analytics_ranking_title()}
	{subtitle}
	bind:metric
	axisLabel={m.ws_analytics_workload()}
	{legend}
	{headers}
	rows={ranked}
	{state}
	{selected}
	{onSelect}
	history={history && metric !== 'gpu'}
	limit={10}
	showAllLabel={(count) => m.ws_analytics_show_all({ count })}
	valueWidth={metric === 'restarts' ? 'auto-cols-[5rem]' : 'auto-cols-[4.5rem]'}
/>

<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, untrack } from 'svelte';

	import {
		fetchInstant,
		fetchRange,
		rangeLiteral,
		stepFor
	} from '$lib/components/dashboard/kit/fetch';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import RankingCard, { type RankRow } from '$lib/components/dashboard/kit/ranking-card.svelte';
	import { m } from '$lib/messages';

	import {
		fmtCount,
		fmtPercent,
		fmtRate,
		fmtSeconds,
		modelKeyFromLabels
	} from '../overview/lib/models';
	import {
		buildRows,
		byModel,
		desiredByDeployment,
		desiredQuery,
		type ManagedModel,
		managedModelFromObject
	} from '../overview/lib/queries';
	import EmptyState from './empty-state.svelte';
	import {
		RANK_COMBINE,
		type RankField,
		rankingQueries,
		rateWindow,
		rpsTrendQuery
	} from './lib/queries';
	import {
		kvClass,
		quietState,
		rankBar,
		type RankedModel,
		rankMax,
		rankModels,
		type RankTab,
		rankValue,
		TONE_TEXT,
		waitingClass
	} from './lib/ranking';

	// Model ranking, which is also the picker: one row per model, ordered by the picked tab.
	let {
		client,
		cluster,
		namespace,
		tick,
		history,
		start,
		end,
		windowLabel,
		tab = $bindable(),
		selected,
		onSelect,
		onRows,
		deployHref,
		onLonger
	}: {
		client: PrometheusDriver;
		cluster: string;
		/** '' for every namespace. */
		namespace: string;
		tick: number;
		history: boolean;
		start: Date;
		end: Date;
		windowLabel: string;
		tab: RankTab;
		selected: string | undefined;
		onSelect: (key: string) => void;
		/** Every model in ranking order, after each answer. */
		onRows: (rows: RankedModel[]) => void;
		/** Where a model is deployed, for the empty state. */
		deployHref?: string;
		/** A longer History window, for the empty state; absent when there is none. */
		onLonger?: () => void;
	} = $props();

	const transport = getContext<Transport>('transport');
	const resources = createClient(ResourceService, transport);

	async function listManaged(): Promise<ManagedModel[] | undefined> {
		try {
			const response = await resources.list({
				cluster,
				group: 'serving.kserve.io',
				version: 'v1alpha2',
				resource: 'llminferenceservices',
				namespace
			});
			return response.items
				.map((item) => managedModelFromObject(item.object))
				.filter((x): x is ManagedModel => x !== undefined);
		} catch (error) {
			console.error('Failed to list LLMInferenceServices:', error);
			return undefined;
		}
	}

	const values = new Loader<RankedModel[]>(async () => {
		const at = history ? end : new Date();
		const window = history
			? { range: rangeLiteral(start, end), step: stepFor(start, end) }
			: undefined;
		const [managed, result] = await Promise.all([
			listManaged(),
			fetchInstant(client, rankingQueries(namespace, window), at)
		]);
		if (!result) return null;
		const metric = (field: RankField) => byModel(result[field], RANK_COMBINE[field]);

		// Desired replicas, from the Deployments the objects name (as Overview does).
		let desired = desiredByDeployment([]);
		const q = managed
			? desiredQuery(
					namespace,
					managed.map((x) => x.deployment ?? '')
				)
			: undefined;
		if (q) {
			const r = await fetchInstant(client, { desired: q });
			if (r) desired = desiredByDeployment(r.desired);
		}

		const rows = buildRows(
			managed,
			{
				rps: metric('rps'),
				gen: metric('gen'),
				prompt: metric('prompt'),
				kv: metric('kvMax'),
				waiting: metric('waiting'),
				windowRequests: metric('windowRequests'),
				pods: metric('pods')
			},
			desired
		);
		const extra = {
			running: metric('running'),
			kvAvg: metric('kvAvg'),
			e2eP99: metric('e2eP99'),
			ttftP99: metric('ttftP99')
		};
		return rows.map((row) => ({
			...row,
			running: extra.running.get(row.key),
			kvAvg: extra.kvAvg.get(row.key),
			e2eP99: extra.e2eP99.get(row.key),
			ttftP99: extra.ttftP99.get(row.key)
		}));
	});

	const trends = new Loader<Map<string, number[]>>(async () => {
		const step = stepFor(start, end, 40);
		const r = await fetchRange(
			client,
			{ trend: rpsTrendQuery(namespace, rateWindow(step)) },
			start,
			end,
			step
		);
		if (!r) return null;
		return new Map(r.trend.map((s) => [modelKeyFromLabels(s.labels), s.points.map((p) => p.v)]));
	});

	const ranked = $derived(rankModels(values.data ?? [], tab));

	$effect(() => {
		void [tick, history, start.getTime(), end.getTime()];
		untrack(async () => {
			await values.load();
			if (values.data) onRows(rankModels(values.data, tab));
		});
	});
	$effect(() => {
		if (!history) return;
		void [start.getTime(), end.getTime()];
		untrack(() => trends.load());
	});

	const TABS = $derived([
		{ value: 'throughput' as RankTab, label: m.model_analytics_tab_throughput() },
		{ value: 'requests' as RankTab, label: m.model_analytics_tab_requests() },
		{ value: 'kv' as RankTab, label: m.model_analytics_tab_kv() },
		{ value: 'p99' as RankTab, label: m.model_analytics_tab_p99() }
	]);

	// History shows averages, which are fractional; Now counts requests.
	const count = (v: number | undefined) => (history ? fmtRate(v) : fmtCount(v));

	function values_(row: RankedModel): RankRow['values'] {
		switch (tab) {
			case 'throughput':
				return [{ text: fmtRate(row.gen) }, { text: fmtRate(row.prompt) }];
			case 'requests':
				return [
					{ text: count(row.running) },
					{ text: count(row.waiting), class: waitingClass(row.waiting) }
				];
			case 'kv':
				return [
					{ text: fmtPercent(row.kvAvg) },
					{ text: fmtPercent(row.kv), class: kvClass(row.kv) }
				];
			case 'p99':
				return [{ text: fmtSeconds(row.e2eP99) }, { text: fmtSeconds(row.ttftP99) }];
		}
	}

	const rows = $derived.by<RankRow[]>(() => {
		const max = rankMax(ranked, tab);
		return ranked.map((row) => {
			const quiet = quietState(row);
			const base = {
				id: row.key,
				label: row.name,
				title: `${row.name} · ${row.namespace}`,
				chips: [row.namespace],
				trend: trends.data?.get(row.key),
				sortKey: rankValue(row, tab) ?? -1
			};
			if (quiet) {
				return {
					...base,
					note:
						quiet === 'starting'
							? m.model_overview_state_starting()
							: m.model_overview_state_idle(),
					noteClass: quiet === 'starting' ? TONE_TEXT.warn : undefined,
					values: []
				};
			}
			const bar = rankBar(row, tab, max);
			return {
				...base,
				bar: { ...bar, softClass: 'bg-chart-1' },
				values: values_(row)
			};
		});
	});

	const headers = $derived(
		tab === 'throughput'
			? [{ text: m.model_analytics_col_gen() }, { text: m.model_analytics_col_prompt() }]
			: tab === 'requests'
				? [{ text: m.running() }, { text: m.waiting() }]
				: tab === 'kv'
					? [{ text: m.model_analytics_col_average() }, { text: m.model_analytics_col_busiest() }]
					: [{ text: m.model_analytics_col_e2e_p99() }, { text: m.model_analytics_col_ttft_p99() }]
	);
</script>

{#if values.state === 'ready' && ranked.length === 0}
	<EmptyState {history} {windowLabel} {deployHref} {onLonger} />
{:else}
	<RankingCard
		title={m.model_analytics_ranking()}
		bind:metric={tab}
		metrics={TABS}
		axisLabel={m.model_analytics_col_model()}
		{headers}
		{rows}
		state={values.state}
		{selected}
		{onSelect}
		{history}
		trendLabel={m.model_analytics_col_trend()}
		limit={10}
		showAllLabel={(count) => m.model_analytics_show_all({ count })}
	/>
{/if}

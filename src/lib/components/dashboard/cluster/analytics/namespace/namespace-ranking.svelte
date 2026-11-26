<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { m } from '$lib/messages';

	import { byLabel, fetchInstant, fetchRange, rangeLiteral, stepFor } from '../lib/fetch';
	import { fmt, fmtCores, fmtGiB, fmtPct } from '../lib/format';
	import { Loader } from '../lib/loader.svelte';
	import {
		averaged,
		NAMESPACE_FACTS,
		namespaceRankingQueries,
		namespaceTrendQuery
	} from '../lib/promql';
	import RankingCard, { type RankMetric, type RankRow } from '../ranking-card.svelte';

	let {
		client,
		tick,
		history,
		start,
		end,
		windowLabel,
		metric = $bindable(),
		selected,
		onSelect,
		onNamespaces,
		namespaceToWorkspace
	}: {
		client: PrometheusDriver;
		tick: number;
		history: boolean;
		start: Date;
		end: Date;
		windowLabel: string;
		metric: RankMetric;
		selected: string | undefined;
		onSelect: (namespace: string) => void;
		onNamespaces: (namespaces: string[]) => void;
		namespaceToWorkspace: Record<string, string>;
	} = $props();

	type Ns = {
		name: string;
		cpu: [number?, number?, number?];
		memory: [number?, number?, number?];
		gpuUtil?: number;
		gpus: number;
		restarts: number;
	};

	const values = new Loader<Ns[]>(
		async () => {
			const range = rangeLiteral(start, end);
			const base = namespaceRankingQueries(history ? range : '1h');
			const queries: Record<string, string> = history
				? { ...averaged(base, range, stepFor(start, end)), ...NAMESPACE_FACTS }
				: { ...base, ...NAMESPACE_FACTS };
			const r = await fetchInstant(client, queries, history ? end : undefined);
			if (!r) return null;
			const get = (k: string) => byLabel(r[k], 'namespace');
			const [cpuUse, cpuReq, cpuLim, memUse, memReq, memLim, gpuUtil, gpus, restarts] = [
				'cpuUse',
				'cpuReq',
				'cpuLim',
				'memUse',
				'memReq',
				'memLim',
				'gpuUtil',
				'gpus',
				'restarts'
			].map(get);
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
			const names = new Set(r.namespaces.map((s) => s.labels.namespace));
			for (const k of cpuUse.keys()) names.add(k);
			return [...names].map((name) => ({
				name,
				cpu: [cpuUse.get(name), cpuReq.get(name), cpuLim.get(name)],
				memory: [memUse.get(name), memReq.get(name), memLim.get(name)],
				gpuUtil: gpuUtil.get(name),
				gpus: Math.round(gpus.get(name) ?? 0),
				restarts: Math.round(restarts.get(name) ?? 0)
			}));
		},
		(list) => list.length === 0
	);

	const trends = new Loader<Map<string, number[]>>(async () => {
		const r = await fetchRange(
			client,
			{ trend: namespaceTrendQuery(metric) },
			start,
			end,
			stepFor(start, end, 40)
		);
		if (!r) return null;
		return new Map(r.trend.map((s) => [s.labels.namespace, s.points.map((p) => p.v)]));
	});

	// After each answer, tell the page the order so it can preselect the first namespace.
	async function refresh() {
		await values.load();
		if (values.data) onNamespaces(rows.map((r) => r.id));
	}

	$effect(() => {
		void [tick, history, start.getTime(), end.getTime()];
		untrack(refresh);
	});
	$effect(() => {
		if (!history) return;
		void [metric, start.getTime(), end.getTime()];
		untrack(() => trends.load());
	});

	const GIB = 1024 ** 3;

	function row(ns: Ns, scale: number): RankRow {
		const workspace = namespaceToWorkspace[ns.name];
		const base = {
			id: ns.name,
			label: ns.name,
			title: workspace ? `${ns.name} · ${workspace}` : ns.name,
			chips: [workspace ? m.analytics_chip_workspace() : m.analytics_chip_system()],
			trend: trends.data?.get(ns.name)
		};
		if (metric === 'cpu' || metric === 'memory') {
			const [use, req, lim] = ns[metric];
			const show = metric === 'cpu' ? fmtCores : fmtGiB;
			return {
				...base,
				bar: { solid: ((use ?? 0) / scale) * 100, soft: ((req ?? 0) / scale) * 100 },
				values: [
					{ text: show(use) },
					{ text: show(req) },
					{ text: show(lim), class: 'text-muted-foreground', minor: true }
				],
				sortKey: use ?? -1
			};
		}
		if (metric === 'gpu') {
			if (ns.gpus === 0 && ns.gpuUtil === undefined) {
				return { ...base, note: m.analytics_no_gpu(), values: [], sortKey: -Infinity };
			}
			return {
				...base,
				bar: { solid: ns.gpuUtil ?? 0 },
				values: [{ text: fmtPct(ns.gpuUtil) }, { text: fmt(ns.gpus) }],
				sortKey: ns.gpuUtil ?? -1
			};
		}
		return {
			...base,
			bar: { solid: (ns.restarts / scale) * 100 },
			values: [{ text: fmt(ns.restarts) }],
			sortKey: ns.restarts
		};
	}

	const rows = $derived.by(() => {
		const list = values.data ?? [];
		// Cores and bytes have no ceiling of their own, so bars share the largest row's scale.
		let scale = 1;
		for (const ns of list) {
			if (metric === 'cpu' || metric === 'memory') {
				const [use, req] = ns[metric];
				scale = Math.max(scale, use ?? 0, req ?? 0);
			} else if (metric === 'restarts') scale = Math.max(scale, ns.restarts);
		}
		if (metric === 'memory') scale = Math.max(scale, GIB);
		return list
			.map((ns) => row(ns, scale))
			.sort((a, b) => b.sortKey - a.sortKey || a.id.localeCompare(b.id));
	});

	const headers = $derived(
		metric === 'gpu'
			? [{ text: m.analytics_util() }, { text: m.analytics_gpus() }]
			: metric === 'restarts'
				? [{ text: history ? m.analytics_in_range() : m.analytics_last_hour() }]
				: [
						{ text: m.analytics_usage() },
						{ text: m.analytics_request() },
						{ text: m.analytics_limit(), minor: true }
					]
	);
	const legend = $derived<[string, string?]>(
		metric === 'gpu'
			? [m.analytics_utilization()]
			: metric === 'restarts'
				? [m.analytics_restarts()]
				: [m.analytics_usage(), m.analytics_request()]
	);
	const axisLabel = $derived(
		metric === 'cpu'
			? m.analytics_cores()
			: metric === 'memory'
				? m.analytics_gib()
				: metric === 'gpu'
					? m.analytics_pct_of_gpu()
					: m.analytics_restart_count()
	);
</script>

<RankingCard
	title={m.analytics_namespace_ranking()}
	subtitle={history
		? m.analytics_ranking_history_hint({ window: windowLabel })
		: m.analytics_ranking_now_hint()}
	bind:metric
	{axisLabel}
	{legend}
	{headers}
	{rows}
	state={values.state}
	{selected}
	{onSelect}
	{history}
	trendMax={metric === 'gpu' ? 100 : undefined}
	limit={8}
/>

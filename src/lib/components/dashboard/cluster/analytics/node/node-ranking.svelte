<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import {
		byLabel,
		fetchInstant,
		fetchRange,
		rangeLiteral,
		stepFor
	} from '$lib/components/dashboard/kit/fetch';
	import { fmt, fmtPct, pressureText } from '$lib/components/dashboard/kit/format';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import RankingCard, {
		type RankMetric,
		type RankRow
	} from '$lib/components/dashboard/kit/ranking-card.svelte';
	import { m } from '$lib/messages';

	import { averaged, NODE_FACTS, nodeRankingQueries, nodeTrendQuery } from '../lib/promql';

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
		onNodes
	}: {
		client: PrometheusDriver;
		tick: number;
		history: boolean;
		start: Date;
		end: Date;
		windowLabel: string;
		metric: RankMetric;
		selected: string | undefined;
		onSelect: (node: string) => void;
		/** The node list in ranking order, so the page can pick a default. */
		onNodes: (nodes: { name: string; roles: string[]; gpus: number }[]) => void;
	} = $props();

	type Node = {
		name: string;
		roles: string[];
		gpus: number;
		cpu: [number?, number?, number?];
		memory: [number?, number?, number?];
		gpuUtil?: number;
		gpuAlloc?: number;
		restarts: number;
	};

	const values = new Loader<Node[]>(
		async () => {
			const range = rangeLiteral(start, end);
			const queries: Record<string, string> = history
				? { ...averaged(nodeRankingQueries(range), range, stepFor(start, end)), ...NODE_FACTS }
				: { ...nodeRankingQueries('1h'), ...NODE_FACTS };
			const r = await fetchInstant(client, queries, history ? end : undefined);
			if (!r) return null;
			const get = (k: string) => byLabel(r[k], 'node');
			const [cpuUse, cpuReq, cpuLim, memUse, memReq, memLim] = [
				'cpuUse',
				'cpuReq',
				'cpuLim',
				'memUse',
				'memReq',
				'memLim'
			].map(get);
			const gpuUtil = get('gpuUtil');
			const gpuAlloc = get('gpuAlloc');
			const restarts = get('restarts');
			const gpus = get('gpus');
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
			const roles = new Map<string, string[]>();
			for (const s of r.roles) {
				const list = roles.get(s.labels.node) ?? [];
				list.push(s.labels.role);
				roles.set(s.labels.node, list);
			}
			return r.nodes.map(({ labels: { node } }) => ({
				name: node,
				roles: roles.get(node) ?? [],
				gpus: gpus.get(node) ?? 0,
				cpu: [cpuUse.get(node), cpuReq.get(node), cpuLim.get(node)],
				memory: [memUse.get(node), memReq.get(node), memLim.get(node)],
				gpuUtil: gpuUtil.get(node),
				gpuAlloc: gpuAlloc.get(node),
				restarts: Math.round(restarts.get(node) ?? 0)
			}));
		},
		(nodes) => nodes.length === 0
	);

	const trends = new Loader<Map<string, number[]>>(async () => {
		const r = await fetchRange(
			client,
			{ trend: nodeTrendQuery(metric) },
			start,
			end,
			stepFor(start, end, 40)
		);
		if (!r) return null;
		return new Map(r.trend.map((s) => [s.labels.node, s.points.map((p) => p.v)]));
	});

	// After each answer, tell the page the order so it can preselect the first node.
	async function refresh() {
		await values.load();
		const data = values.data;
		if (!data) return;
		onNodes(
			rows
				.map((r) => data.find((n) => n.name === r.id))
				.filter((n): n is Node => !!n)
				.map((n) => ({ name: n.name, roles: n.roles, gpus: n.gpus }))
		);
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

	const isMaster = (roles: string[]) => roles.some((r) => r === 'control-plane' || r === 'master');

	function chips(node: Node): string[] {
		const list: string[] = [];
		if (isMaster(node.roles)) list.push(m.analytics_chip_master());
		list.push(node.gpus > 0 ? m.analytics_chip_gpu() : m.analytics_chip_cpu());
		return list;
	}

	function row(node: Node): RankRow {
		const base = {
			id: node.name,
			label: node.name,
			chips: chips(node),
			trend: trends.data?.get(node.name)
		};
		if (metric === 'cpu' || metric === 'memory') {
			const [use, req, lim] = node[metric];
			return {
				...base,
				bar: { solid: use ?? 0, soft: req, over: (req ?? 0) > 100 },
				values: [
					{ text: fmtPct(use) },
					{ text: fmtPct(req), class: pressureText(req) },
					{ text: fmtPct(lim), class: 'text-muted-foreground', minor: true }
				],
				// Requests are what fills a node, so they set the order; usage is read against them.
				sortKey: req ?? -1
			};
		}
		if (metric === 'gpu') {
			if (node.gpus === 0) {
				return { ...base, note: m.analytics_no_gpu(), values: [], sortKey: -Infinity };
			}
			return {
				...base,
				bar: { solid: node.gpuUtil ?? 0, soft: node.gpuAlloc },
				values: [
					{ text: fmtPct(node.gpuUtil) },
					{ text: fmtPct(node.gpuAlloc), class: pressureText(node.gpuAlloc) }
				],
				sortKey: node.gpuAlloc ?? -1
			};
		}
		return {
			...base,
			bar: { solid: 0 },
			values: [{ text: fmt(node.restarts) }],
			sortKey: node.restarts
		};
	}

	const rows = $derived.by(() => {
		const list = (values.data ?? []).map(row).sort((a, b) => b.sortKey - a.sortKey);
		if (metric === 'restarts') {
			const top = Math.max(1, ...list.map((r) => r.sortKey));
			for (const r of list) r.bar = { solid: (r.sortKey / top) * 100 };
		}
		return list;
	});

	const headers = $derived(
		metric === 'gpu'
			? [{ text: m.analytics_util() }, { text: m.analytics_allocated() }]
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
			? [m.analytics_utilization(), m.analytics_allocated()]
			: metric === 'restarts'
				? [m.analytics_restarts()]
				: [m.analytics_usage(), m.analytics_request()]
	);
</script>

<RankingCard
	title={m.analytics_node_ranking()}
	subtitle={history
		? m.analytics_ranking_history_hint({ window: windowLabel })
		: m.analytics_ranking_now_hint()}
	bind:metric
	axisLabel={metric === 'restarts'
		? m.analytics_restart_count()
		: metric === 'gpu'
			? m.analytics_pct_of_gpu()
			: m.analytics_pct_of_allocatable()}
	{legend}
	{headers}
	{rows}
	state={values.state}
	{selected}
	{onSelect}
	{history}
	trendMax={metric === 'restarts' ? undefined : 100}
/>

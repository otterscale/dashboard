<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { InstantVector, PrometheusDriver, RangeVector } from 'prometheus-query';
	import { getContext, onDestroy, onMount, untrack } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { type WidgetState, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { computeStep, rangeLiteralFromWindow } from '$lib/prometheus';

	import {
		chartModels,
		fmtCount,
		fmtPercent,
		fmtRate,
		kvTone,
		modelColors,
		modelKeyFromLabels,
		type ModelRow,
		pickerId,
		sortModels,
		summarize
	} from './lib/models';
	import {
		buildRows,
		byModel,
		COMBINE,
		desiredByDeployment,
		desiredQuery,
		type InstantField,
		instantQueries,
		kvQuery,
		type ManagedModel,
		managedModelFromObject,
		rpsQuery,
		type Sample,
		workspaceByNamespace
	} from './lib/queries';
	import { type ModelRange, rangeKeys, sparkValues, type TrendLine, trendLines } from './lib/trend';
	import ModelsTable from './models-table.svelte';
	import SummaryStrip, { type SummaryItem } from './summary-strip.svelte';
	import TrendChart from './trend-chart.svelte';

	// Model Overview v2: which model, if any, needs a look right now. A strip of totals, one row
	// per model, and the two trends drawn per model. Engine (vLLM) metrics only.
	let {
		prometheusDriver,
		cluster,
		namespace,
		start,
		end,
		endIsNow,
		emptyHref,
		onopen,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		/** '' means every namespace (cluster scope only). */
		namespace: string;
		start: Date;
		end: Date;
		endIsNow: boolean;
		/** AI Studio › Model, for the empty table. */
		emptyHref: string;
		/** Open a model in Analytics, by the model picker's id and its namespace. */
		onopen: (model: { id: string; namespace: string }) => void;
		isReloading: boolean;
	} = $props();

	const transport: Transport = getContext('transport');
	const client = createClient(ResourceService, transport);

	const HOUR = 3600_000;
	const SPARK_STEP = 120;

	let loaded = $state(false);
	let managed = $state<ManagedModel[] | undefined>(undefined);
	let apiFailed = $state(false);
	let metrics = $state.raw<Partial<Record<InstantField, Map<string, number>>>>({});
	let promFailed = $state(false);
	let desired = $state.raw(desiredByDeployment([]));
	let rpsRange = $state.raw<ModelRange[] | undefined>(undefined);
	let kvRange = $state.raw<ModelRange[] | undefined>(undefined);
	let sparkRange = $state.raw<ModelRange[] | undefined>(undefined);

	function samples(result: InstantVector[]): Sample[] {
		return result.map((v) => ({
			labels: v.metric.labels as Record<string, string>,
			value: Number(v.value.value)
		}));
	}

	function ranges(result: RangeVector[]): ModelRange[] {
		return result.map((r) => ({
			key: modelKeyFromLabels(r.metric.labels as Record<string, string>),
			points: r.values
				.map((v) => ({ time: new Date(v.time).getTime(), value: Number(v.value) }))
				.filter((p) => Number.isFinite(p.value))
		}));
	}

	async function listManaged(): Promise<ManagedModel[]> {
		const response = await client.list({
			cluster,
			group: 'serving.kserve.io',
			version: 'v1alpha2',
			resource: 'llminferenceservices',
			namespace
		});
		return response.items
			.map((item) => managedModelFromObject(item.object))
			.filter((x): x is ManagedModel => x !== undefined);
	}

	// With every namespace in view, each row says which Workspace it belongs to. Anywhere else the
	// whole table is one Workspace, so the rows carry no second line.
	let workspaceOf = $state.raw<Record<string, string>>({});
	async function listWorkspaces() {
		try {
			const response = await client.list({
				cluster,
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				namespace: ''
			});
			workspaceOf = workspaceByNamespace(response.items.map((item) => item.object));
		} catch (error) {
			console.error('Failed to list workspaces:', error);
		}
	}
	function subtitle(row: ModelRow): string | undefined {
		if (namespace !== '') return undefined;
		return (
			workspaceOf[row.namespace] ?? m.model_overview_namespace_label({ namespace: row.namespace })
		);
	}

	let generation = 0;
	async function fetchAll() {
		const run = ++generation;
		const endMs = endIsNow ? Date.now() : end.getTime();
		const startMs = start.getTime();
		const at = new Date(endMs);
		const queries = instantQueries(namespace, rangeLiteralFromWindow(startMs, endMs));
		const fields = Object.keys(queries) as InstantField[];
		const step = computeStep(startMs, endMs);

		const [api, rps, kv, spark, ...instant] = await Promise.allSettled([
			listManaged(),
			prometheusDriver.rangeQuery(rpsQuery(namespace), startMs, endMs, step),
			prometheusDriver.rangeQuery(kvQuery(namespace), startMs, endMs, step),
			prometheusDriver.rangeQuery(rpsQuery(namespace), endMs - HOUR, endMs, SPARK_STEP),
			...fields.map((f) => prometheusDriver.instantQuery(queries[f], at))
		]);

		// Desired replicas need the Deployments the objects name.
		let nextDesired = desiredByDeployment([]);
		const list = api.status === 'fulfilled' ? api.value : undefined;
		const q = list
			? desiredQuery(
					namespace,
					list.map((x) => x.deployment ?? '')
				)
			: undefined;
		if (q) {
			try {
				nextDesired = desiredByDeployment(
					samples((await prometheusDriver.instantQuery(q, at)).result)
				);
			} catch (error) {
				console.error('Failed to read desired replicas:', error);
			}
		}
		if (run !== generation) return;

		if (api.status === 'rejected')
			console.error('Failed to list LLMInferenceServices:', api.reason);
		managed = list;
		apiFailed = api.status === 'rejected';
		desired = nextDesired;

		const next: Partial<Record<InstantField, Map<string, number>>> = {};
		fields.forEach((f, i) => {
			const r = instant[i];
			if (r.status === 'fulfilled') next[f] = byModel(samples(r.value.result), COMBINE[f]);
		});
		metrics = next;
		promFailed = instant.every((r) => r.status === 'rejected');

		rpsRange = rps.status === 'fulfilled' ? ranges(rps.value.result) : undefined;
		kvRange = kv.status === 'fulfilled' ? ranges(kv.value.result) : undefined;
		sparkRange = spark.status === 'fulfilled' ? ranges(spark.value.result) : undefined;
		loaded = true;
	}

	const reload = new ReloadManager(fetchAll);
	onMount(() => {
		if (namespace === '') listWorkspaces();
		if (!isReloading) fetchAll();
	});
	$effect(() => {
		const live = isReloading;
		untrack(() => (live ? reload.restart() : reload.stop()));
	});
	onDestroy(() => reload.stop());

	const rows = $derived(sortModels(buildRows(managed, metrics, desired)));
	const summary = $derived(summarize(rows));
	// The charts draw the four busiest models of those that report; the table has the rest.
	const drawable = $derived(rangeKeys(rpsRange, kvRange));
	const colors = $derived(modelColors(chartModels(drawable, metrics.windowRequests)));
	const chartNote = $derived(
		drawable.length > colors.size
			? m.model_overview_top_models({ shown: colors.size, total: drawable.length })
			: undefined
	);
	const kvNote = $derived(
		drawable.length > colors.size
			? m.model_overview_kv_by_model_note_top({ shown: colors.size, total: drawable.length })
			: m.model_overview_kv_by_model_note()
	);

	const sparks = $derived(sparkValues(sparkRange ?? []));

	const rpsTrend = $derived(trendLines(rpsRange ?? [], colors, 'sum'));
	const kvTrend = $derived(trendLines(kvRange ?? [], colors, 'max'));

	function chartState(data: ModelRange[] | undefined, series: TrendLine[]): WidgetState {
		if (!loaded) return 'loading';
		if (data === undefined) return 'error';
		return series.length > 0 ? 'ready' : 'empty';
	}

	const stripState = $derived(widgetState(loaded, true, promFailed));
	const tableState = $derived<WidgetState>(
		!loaded ? 'loading' : apiFailed && promFailed ? 'error' : rows.length === 0 ? 'empty' : 'ready'
	);

	const noData = m.no_data_display();
	const items = $derived<SummaryItem[]>([
		{
			label: m.model_overview_models_serving(),
			value: m.model_overview_n_of_m({ serving: summary.serving, total: summary.total }),
			note: summary.starting
				? m.model_overview_starting_count({ count: summary.starting })
				: undefined
		},
		{
			label: m.model_overview_rps(),
			value: fmtRate(summary.rps),
			note: summary.rps === undefined ? noData : m.model_overview_rps_note()
		},
		{
			label: m.model_overview_gen_tps(),
			value: fmtRate(summary.gen),
			note:
				summary.prompt === undefined
					? noData
					: m.model_overview_prompt_tps_note({ value: fmtRate(summary.prompt) })
		},
		{
			label: m.model_overview_waiting(),
			value: fmtCount(summary.waiting),
			tone: (summary.waiting ?? 0) > 0 ? 'warn' : undefined,
			note:
				summary.waiting === undefined
					? noData
					: summary.waitingIn.length > 1
						? m.model_overview_waiting_in_more({
								model: summary.waitingIn[0],
								count: summary.waitingIn.length - 1
							})
						: summary.waitingIn.length
							? m.model_overview_waiting_in({ models: summary.waitingIn[0] })
							: m.model_overview_nothing_queued()
		},
		{
			label: m.model_overview_highest_kv(),
			value: fmtPercent(summary.kv),
			tone: kvTone(summary.kv),
			note:
				summary.kvModel === undefined
					? noData
					: m.model_overview_busiest_pod_of({ model: summary.kvModel })
		}
	]);

	function open(row: ModelRow) {
		onopen({ id: pickerId(row.key), namespace: row.namespace });
	}
</script>

<div class="@container flex flex-col gap-3 pt-4">
	<SummaryStrip {items} state={stripState} label={m.model_overview_totals()} />
	<ModelsTable
		{rows}
		{sparks}
		state={tableState}
		{emptyHref}
		{subtitle}
		notice={promFailed
			? m.model_overview_metrics_failed()
			: apiFailed
				? m.model_overview_list_failed()
				: undefined}
		onopen={open}
	/>
	<div class="grid grid-cols-1 gap-3 @4xl:grid-cols-2">
		<TrendChart
			title={m.model_overview_rps_by_model()}
			note={chartNote}
			data={rpsTrend.points}
			series={rpsTrend.series}
			format={fmtRate}
			state={chartState(rpsRange, rpsTrend.series)}
		/>
		<TrendChart
			title={m.model_overview_kv_by_model()}
			note={kvNote}
			data={kvTrend.points}
			series={kvTrend.series}
			format={(v) => `${Math.round(v)}%`}
			state={chartState(kvRange, kvTrend.series)}
			yMax={100}
			threshold={90}
		/>
	</div>
</div>

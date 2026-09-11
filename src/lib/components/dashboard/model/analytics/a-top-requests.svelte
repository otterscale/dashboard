<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { type TopBar, TopBarList } from '$lib/components/custom/top-bar-list';
	import { m } from '$lib/messages';
	import {
		escapePromqlStringLiteral,
		fetchCombinedInstant,
		type ThresholdLevel,
		type VllmModelIdentity,
		vllmModelIdentityFromLabels
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable(),
		onModelClick
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		isReloading: boolean;
		onModelClick?: (model: string) => void;
	} = $props();

	type Row = VllmModelIdentity & { running: number; waiting: number };

	let bars = $state<TopBar[]>([]);
	let isLoaded = $state(false);

	// Running = on the GPU right now; waiting = queued in the vLLM scheduler. Both are
	// gauges, so no rate() — and they are additive across a model's pods, so sum them.
	function queries(): Record<string, string> {
		const ns = (namespace ?? '').trim();
		const nsSel = ns ? `{namespace="${escapePromqlStringLiteral(ns)}"}` : '{}';
		const by = 'sum by(llm_inference_service, model_name)';
		return {
			running: `${by} (vllm:num_requests_running${nsSel})`,
			waiting: `${by} (vllm:num_requests_waiting${nsSel})`
		};
	}

	const RUNNING_CLASS = 'bg-chart-2';
	const WAITING_CLASS = 'bg-chart-1';
	const textClassByLevel: Record<ThresholdLevel, string> = {
		green: '',
		orange: 'text-chart-1',
		red: 'text-destructive'
	};

	// A queue at all is worth a look; a queue as long as the active batch means the model
	// is saturated and every new request will wait a full scheduling round.
	function queueLevel(running: number, waiting: number): ThresholdLevel {
		if (waiting <= 0) return 'green';
		return waiting >= running ? 'red' : 'orange';
	}

	function mergeRows(
		vectors: { metric: { labels: object }; value?: { value: unknown } }[],
		key: 'running' | 'waiting',
		into: Map<string, Row>
	) {
		for (const v of vectors) {
			const identity = vllmModelIdentityFromLabels(v.metric.labels as Record<string, string>);
			const value = Number(v.value?.value);
			if (!Number.isFinite(value)) continue;
			// A model id can show up in several rows (LoRA adapters, shared standalone
			// model_name across namespaces) — see `mergeVllmRowsById`; counts are additive.
			const row = into.get(identity.id) ?? { ...identity, running: 0, waiting: 0 };
			row[key] += value;
			into.set(identity.id, row);
		}
	}

	async function fetch() {
		try {
			const result = await fetchCombinedInstant(prometheusDriver, queries());
			const rows = new Map<string, Row>();
			mergeRows(result.running, 'running', rows);
			mergeRows(result.waiting, 'waiting', rows);

			bars = [...rows.values()]
				.map(({ label, id, badge, running, waiting }) => {
					const total = running + waiting;
					return {
						label,
						id,
						badge,
						value: total,
						displayValue: `${Math.round(running)} / ${Math.round(waiting)}`,
						textClass: textClassByLevel[queueLevel(running, waiting)],
						segments: [
							{ value: running, class: RUNNING_CLASS },
							{ value: waiting, class: WAITING_CLASS }
						]
					};
				})
				// Busiest first; among equals, the longer queue is the more urgent one.
				.sort((a, b) => b.value - a.value || b.segments[1].value - a.segments[1].value);
		} catch {
			bars = [];
		}
	}

	const reloadManager = new ReloadManager(fetch);

	onMount(() => {
		fetch().then(() => (isLoaded = true));
	});
	onDestroy(() => reloadManager.stop());

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	const legend = [
		{ label: m.running(), class: RUNNING_CLASS },
		{ label: m.waiting(), class: WAITING_CLASS }
	];
</script>

<TopBarList
	title={m.top_models_by_requests()}
	description={m.llm_dashboard_top_requests_description()}
	tooltip={m.llm_dashboard_top_requests_tooltip()}
	{bars}
	{legend}
	{isLoaded}
	onBarClick={onModelClick}
	scrollable
/>

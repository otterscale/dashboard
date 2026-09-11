<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { type TopBar, TopBarList } from '$lib/components/custom/top-bar-list';
	import { formatLatency } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		type ActivityState,
		escapePromqlStringLiteral,
		fetchCombinedInstant,
		mergeVllmRowsById,
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

	let bars = $state<TopBar[]>([]);
	let isLoaded = $state(false);
	let activity = $state<ActivityState>('absent');

	function buildQueries(): Record<string, string> {
		const ns = (namespace ?? '').trim();
		const nsSel = ns ? `{namespace="${escapePromqlStringLiteral(ns)}"}` : '{}';
		return {
			p99:
				`histogram_quantile(0.99, sum by(llm_inference_service, model_name, le) ` +
				`(rate(vllm:e2e_request_latency_seconds_bucket${nsSel}[5m])))`,
			// Rides along in the same combined query at no extra request: an idle model yields a
			// flat 0 here, while one that was never scraped yields no series at all. Without it,
			// every p99 is NaN and gets filtered out, leaving both cases indistinguishable.
			traffic: `sum(rate(vllm:e2e_request_latency_seconds_count${nsSel}[5m]))`
		};
	}

	function formatSeconds(value: number): string {
		const { value: scaled, unit } = formatLatency(value);
		return `${scaled.toFixed(2)} ${unit}`;
	}

	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, buildQueries());
			const probe = Number(r.traffic[0]?.value?.value);
			activity = !Number.isFinite(probe) ? 'absent' : probe > 0 ? 'active' : 'idle';
			const parsed = r.p99
				.map((v) => {
					const identity = vllmModelIdentityFromLabels(v.metric.labels as Record<string, string>);
					const value = Number(v.value?.value);
					return Number.isFinite(value) ? { ...identity, value } : null;
				})
				.filter((x): x is VllmModelIdentity & { value: number } => x !== null);

			// p99 can't be merged exactly across split rows; keep the worst (max) per model id.
			const merged = mergeVllmRowsById(parsed, Math.max);

			bars = merged.map(({ label, id, badge, value }) => ({
				label,
				id,
				badge,
				value,
				displayValue: formatSeconds(value)
			}));
		} catch {
			bars = [];
			activity = 'absent';
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
</script>

<TopBarList
	title={m.top_models_by_p99_latency()}
	description={m.llm_dashboard_top_p99_latency_description()}
	tooltip={m.llm_dashboard_top_p99_latency_tooltip()}
	{bars}
	{isLoaded}
	{activity}
	onBarClick={onModelClick}
	scrollable
/>

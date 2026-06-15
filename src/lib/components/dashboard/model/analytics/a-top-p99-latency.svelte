<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { formatLatency } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import {
		escapePromqlStringLiteral,
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

	type Bar = { label: string; value: number; displayValue: string; id?: string; badge?: string };

	let bars = $state<Bar[]>([]);
	let isLoaded = $state(false);

	function buildQuery(): string {
		const ns = (namespace ?? '').trim();
		const nsSel = ns ? `{namespace="${escapePromqlStringLiteral(ns)}"}` : '{}';
		return (
			`histogram_quantile(0.99, sum by(llm_inference_service, model_name, le) ` +
			`(rate(vllm:e2e_request_latency_seconds_bucket${nsSel}[5m])))`
		);
	}

	function formatSeconds(value: number): string {
		const { value: scaled, unit } = formatLatency(value);
		return `${scaled.toFixed(2)} ${unit}`;
	}

	async function fetch() {
		try {
			const response = await prometheusDriver.instantQuery(buildQuery());
			const parsed = response.result
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
	onBarClick={onModelClick}
	scrollable
/>

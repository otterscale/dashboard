<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { formatLatency } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

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

	type Bar = { label: string; value: number; displayValue: string };

	let bars = $state<Bar[]>([]);
	let isLoaded = $state(false);

	function buildQuery(): string {
		const ns = (namespace ?? '').trim();
		const nsSel = ns ? `{namespace="${escapePromqlStringLiteral(ns)}"}` : '{}';
		return (
			`topk(10, histogram_quantile(0.99, sum by(llm_inference_service, le) ` +
			`(rate(vllm:e2e_request_latency_seconds_bucket${nsSel}[5m]))))`
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
					const labels = v.metric.labels as Record<string, string>;
					const label = labels.llm_inference_service ?? '(unknown)';
					const value = Number(v.value?.value);
					return Number.isFinite(value) ? { label, value } : null;
				})
				.filter((x): x is { label: string; value: number } => x !== null)
				.sort((a, b) => b.value - a.value);

			bars = parsed.map(({ label, value }) => ({
				label,
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
/>

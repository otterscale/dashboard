<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	import TopBarList from './top-bar-list.svelte';

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
			`topk(10, sum by(llm_inference_service) (` +
			`rate(vllm:prompt_tokens_total${nsSel}[5m])` +
			` + rate(vllm:generation_tokens_total${nsSel}[5m])))`
		);
	}

	function formatTokensPerSec(value: number): string {
		if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M/s`;
		if (value >= 1_000) return `${(value / 1_000).toFixed(2)}K/s`;
		return `${value.toFixed(1)}/s`;
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
				displayValue: formatTokensPerSec(value)
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
	title={m.top_models_by_throughput()}
	description={m.llm_dashboard_top_throughput_description()}
	tooltip={m.llm_dashboard_top_throughput_tooltip()}
	{bars}
	{isLoaded}
	onBarClick={onModelClick}
/>

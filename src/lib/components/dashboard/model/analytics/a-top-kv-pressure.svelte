<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { TopBarList } from '$lib/components/custom/top-bar-list';
	import { m } from '$lib/paraglide/messages';
	import {
		classifyThreshold,
		escapePromqlStringLiteral,
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

	type Bar = {
		label: string;
		value: number;
		displayValue: string;
		barClass?: string;
		textClass?: string;
		id?: string;
		badge?: string;
	};

	let bars = $state<Bar[]>([]);
	let isLoaded = $state(false);

	function buildQuery(): string {
		const ns = (namespace ?? '').trim();
		const nsSel = ns ? `{namespace="${escapePromqlStringLiteral(ns)}"}` : '{}';
		return `topk(10, max by(llm_inference_service, model_name) (vllm:kv_cache_usage_perc${nsSel})) * 100`;
	}

	const barClassByLevel: Record<'green' | 'orange' | 'red', string> = {
		green: 'bg-chart-2',
		orange: 'bg-chart-1',
		red: 'bg-destructive'
	};
	const textClassByLevel: Record<'green' | 'orange' | 'red', string> = {
		green: 'text-chart-2',
		orange: 'text-chart-1',
		red: 'text-destructive'
	};

	async function fetch() {
		try {
			const response = await prometheusDriver.instantQuery(buildQuery());
			const parsed = response.result
				.map((v) => {
					const identity = vllmModelIdentityFromLabels(v.metric.labels as Record<string, string>);
					const value = Number(v.value?.value);
					return Number.isFinite(value) ? { ...identity, value } : null;
				})
				.filter((x): x is VllmModelIdentity & { value: number } => x !== null)
				.sort((a, b) => b.value - a.value);

			bars = parsed.map(({ label, id, badge, value }) => {
				const level = classifyThreshold(value, { green: 70, orange: 85 }, 'lower-is-better');
				return {
					label,
					id,
					badge,
					value,
					displayValue: `${value.toFixed(1)}%`,
					barClass: barClassByLevel[level],
					textClass: textClassByLevel[level]
				};
			});
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
	title={m.top_models_by_kv_pressure()}
	description={m.llm_dashboard_top_kv_pressure_description()}
	tooltip={m.llm_dashboard_top_kv_pressure_tooltip()}
	{bars}
	{isLoaded}
	onBarClick={onModelClick}
/>

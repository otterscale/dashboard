<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { type TopBar, TopBarList } from '$lib/components/custom/top-bar-list';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		classifyThreshold,
		escapePromqlStringLiteral,
		fetchCombinedInstant,
		type ThresholdLevel
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string | undefined;
		isReloading?: boolean;
	} = $props();

	const selector = $derived.by(() => {
		const ns = (namespace ?? '').trim();
		return ns && ns !== '.*' ? `{namespace="${escapePromqlStringLiteral(ns)}"}` : '';
	});

	let bars = $state<TopBar[]>([]);
	let isLoaded = $state(false);

	function barClass(level: ThresholdLevel): string {
		return level === 'red' ? 'bg-destructive' : level === 'orange' ? 'bg-chart-1' : 'bg-chart-2';
	}
	function textClass(level: ThresholdLevel): string {
		return level === 'red' ? 'text-destructive' : '';
	}

	async function fetch() {
		try {
			const result = await fetchCombinedInstant(prometheusDriver, {
				used: `max by (namespace,persistentvolumeclaim) (kubelet_volume_stats_used_bytes${selector})`,
				avail: `min by (namespace,persistentvolumeclaim) (kubelet_volume_stats_available_bytes${selector})`
			});
			const byPvc: Record<string, { ns: string; pvc: string; used: number; avail: number }> = {};
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const labels = v.metric.labels as Record<string, string>;
					const ns = labels.namespace ?? '';
					const pvc = labels.persistentvolumeclaim ?? '';
					if (!pvc) continue;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					const id = `${ns}/${pvc}`;
					const row = (byPvc[id] ??= { ns, pvc, used: 0, avail: 0 });
					row[key as 'used' | 'avail'] = value;
				}
			}
			bars = Object.values(byPvc)
				.map(({ ns, pvc, used, avail }) => {
					const total = used + avail;
					const pct = total > 0 ? (used / total) * 100 : 0;
					const level = classifyThreshold(pct, { green: 70, orange: 90 });
					const u = formatCapacity(used);
					const t = formatCapacity(total);
					return {
						label: `${ns}/${pvc}`,
						value: pct,
						displayValue: `${u.value} ${u.unit} / ${t.value} ${t.unit}`,
						barClass: barClass(level),
						textClass: textClass(level)
					};
				})
				.sort((a, b) => b.value - a.value);
		} catch (error) {
			console.error('Failed to fetch PVC storage:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<TopBarList
	title={m.pvc_storage_usage()}
	description={m.pvc_storage_usage_description()}
	tooltip={m.pvc_storage_usage_tooltip()}
	{bars}
	{isLoaded}
	scrollable
/>

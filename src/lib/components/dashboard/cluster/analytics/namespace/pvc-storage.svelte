<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import { levelOf } from '$lib/components/dashboard/shared/status';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, fetchCombinedInstantOrNull } from '$lib/prometheus';

	import type { RankingRow } from '../ranking';
	import RankingList from '../ranking-list.svelte';

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

	const storage = useLoadable<RankingRow[]>(
		async () => {
			const result = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					used: `max by (namespace,persistentvolumeclaim) (kubelet_volume_stats_used_bytes${selector})`,
					avail: `min by (namespace,persistentvolumeclaim) (kubelet_volume_stats_available_bytes${selector})`
				})
			);
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
			const rows = Object.values(byPvc)
				.map(({ ns, pvc, used, avail }) => {
					const total = used + avail;
					const pct = total > 0 ? (used / total) * 100 : 0;
					const u = formatCapacity(used);
					const t = formatCapacity(total);
					return {
						label: `${ns}/${pvc}`,
						value: pct,
						displayValue: `${u.value} ${u.unit} / ${t.value} ${t.unit}`,
						level: levelOf(pct)
					};
				})
				.sort((a, b) => b.value - a.value);
			return rows.length > 0 ? rows : null;
		},
		() => isReloading ?? false
	);
</script>

<RankingList
	title={m.pvc_storage_usage()}
	description={m.pvc_storage_usage_description()}
	info={m.pvc_storage_usage_tooltip()}
	rows={storage.data ?? []}
	status={storage.status}
	stale={storage.stale}
	visible={8}
/>

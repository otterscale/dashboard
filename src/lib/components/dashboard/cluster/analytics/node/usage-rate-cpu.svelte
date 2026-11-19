<script lang="ts">
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import { m } from '$lib/messages';
	import { fetchCombinedInstantOrNull } from '$lib/prometheus';

	import KpiRatioValue from './kpi-ratio-value.svelte';

	let {
		client,
		fqdn,
		isReloading = $bindable()
	}: { client: PrometheusDriver; fqdn: string; isReloading?: boolean } = $props();

	// All three scalars come back in a single `or`-unioned instant query.
	const usage = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(client, {
					count: `count(count by (cpu, instance) (node_cpu_seconds_total{instance=~"${fqdn}"}))`,
					using: `sum(irate(node_cpu_seconds_total{instance=~"${fqdn}",mode!="idle"}[6m]))`,
					total: `sum(irate(node_cpu_seconds_total{instance=~"${fqdn}"}[6m]))`
				})
			);
			const count: number | null = r.count[0]?.value?.value ?? null;
			const using: number | null = r.using[0]?.value?.value ?? null;
			const total: number | null = r.total[0]?.value?.value ?? null;
			if (using === null || total === null) return null;
			return { count, using: Number(using), total: Number(total) };
		},
		() => isReloading ?? false
	);

	const pct = $derived(usage.data?.total ? (usage.data.using / usage.data.total) * 100 : 0);
	const subLine = $derived(`${usage.data?.count ?? 'N/A'} ${m.cpu()}`);
</script>

<KpiRatioValue
	title={m.cpu()}
	description={m.node_detail_cpu_description()}
	tooltip={m.node_detail_cpu_tooltip()}
	icon={CpuIcon}
	status={usage.status}
	stale={usage.stale}
	{pct}
	{subLine}
/>

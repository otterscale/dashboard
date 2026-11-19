<script lang="ts">
	import MemoryStickIcon from '@lucide/svelte/icons/memory-stick';
	import { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { fetchCombinedInstantOrNull } from '$lib/prometheus';

	import KpiRatioValue from './kpi-ratio-value.svelte';

	let {
		client,
		fqdn,
		isReloading = $bindable()
	}: { client: PrometheusDriver; fqdn: string; isReloading?: boolean } = $props();

	// Both scalars come back in a single `or`-unioned instant query.
	const usage = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(client, {
					using: `sum(node_memory_MemTotal_bytes{instance=~"${fqdn}"}) - sum(node_memory_MemAvailable_bytes{instance=~"${fqdn}"})`,
					total: `sum(node_memory_MemTotal_bytes{instance=~"${fqdn}"})`
				})
			);
			const using: number | null = r.using[0]?.value?.value ?? null;
			const total: number | null = r.total[0]?.value?.value ?? null;
			if (using === null || total === null) return null;
			return { using: Number(using), total: Number(total) };
		},
		() => isReloading ?? false
	);

	const pct = $derived(usage.data?.total ? (usage.data.using / usage.data.total) * 100 : 0);
	const subLine = $derived.by(() => {
		const used = formatCapacity(usage.data?.using ?? 0);
		const total = formatCapacity(usage.data?.total ?? 0);
		return `${used.value} ${used.unit} / ${total.value} ${total.unit}`;
	});
</script>

<KpiRatioValue
	title={m.ram()}
	description={m.node_detail_ram_description()}
	tooltip={m.node_detail_ram_tooltip()}
	icon={MemoryStickIcon}
	status={usage.status}
	stale={usage.stale}
	{pct}
	{subLine}
/>

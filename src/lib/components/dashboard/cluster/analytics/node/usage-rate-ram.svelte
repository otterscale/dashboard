<script lang="ts">
	import MemoryStickIcon from '@lucide/svelte/icons/memory-stick';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { fetchCombinedInstant } from '$lib/prometheus';

	import KpiCard from '../kpi-card.svelte';
	import KpiRatioValue from './kpi-ratio-value.svelte';

	let {
		client,
		fqdn,
		isReloading = $bindable()
	}: { client: PrometheusDriver; fqdn: string; isReloading?: boolean } = $props();

	let usingVal = $state<number | null>(null);
	let totalVal = $state<number | null>(null);
	let isLoaded = $state(false);

	// Both scalars come back in a single `or`-unioned instant query.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(client, {
				using: `sum(node_memory_MemTotal_bytes{instance=~"${fqdn}"}) - sum(node_memory_MemAvailable_bytes{instance=~"${fqdn}"})`,
				total: `sum(node_memory_MemTotal_bytes{instance=~"${fqdn}"})`
			});
			usingVal = r.using[0]?.value?.value ?? null;
			totalVal = r.total[0]?.value?.value ?? null;
		} catch {
			usingVal = null;
			totalVal = null;
		}
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});

	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => reloadManager.stop());

	const isEmpty = $derived(usingVal === null || totalVal === null);
	const pct = $derived(totalVal ? (Number(usingVal) / Number(totalVal)) * 100 : 0);
	const subLine = $derived.by(() => {
		const used = formatCapacity(Number(usingVal ?? 0));
		const total = formatCapacity(Number(totalVal ?? 0));
		return `${used.value} ${used.unit} / ${total.value} ${total.unit}`;
	});
</script>

<KpiCard
	title={m.ram()}
	description={m.node_detail_ram_description()}
	tooltip={m.node_detail_ram_tooltip()}
	icon={MemoryStickIcon}
	{isLoaded}
	{isEmpty}
>
	<KpiRatioValue {pct} {subLine} />
</KpiCard>

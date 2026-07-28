<script lang="ts">
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
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
				using: `sum(node_filesystem_size_bytes{fstype!="rootfs",instance=~"${fqdn}",mountpoint="/"}) - sum(node_filesystem_avail_bytes{fstype!="rootfs",instance=~"${fqdn}",mountpoint="/"})`,
				total: `sum(node_filesystem_size_bytes{fstype!="rootfs",instance=~"${fqdn}",mountpoint="/"})`
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

	const isEmpty = $derived(usingVal === null || totalVal === null || Number(totalVal) === 0);
	const pct = $derived(Number(totalVal) > 0 ? (Number(usingVal) / Number(totalVal)) * 100 : 0);
	const subLine = $derived.by(() => {
		const used = formatCapacity(Number(usingVal ?? 0));
		const total = formatCapacity(Number(totalVal ?? 0));
		return `${used.value} ${used.unit} / ${total.value} ${total.unit}`;
	});
</script>

<KpiCard
	title={m.file_system()}
	description={m.node_detail_filesystem_description()}
	tooltip={m.node_detail_filesystem_tooltip()}
	icon={HardDriveIcon}
	{isLoaded}
	{isEmpty}
>
	<KpiRatioValue {pct} {subLine} />
</KpiCard>

<script lang="ts">
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { m } from '$lib/messages';
	import { fetchCombinedInstant } from '$lib/prometheus';

	import KpiCard from '../kpi-card.svelte';
	import KpiRatioValue from './kpi-ratio-value.svelte';

	let {
		client,
		fqdn,
		isReloading = $bindable()
	}: { client: PrometheusDriver; fqdn: string; isReloading?: boolean } = $props();

	let cpuCount = $state<number | null>(null);
	let usingVal = $state<number | null>(null);
	let totalVal = $state<number | null>(null);
	let isLoaded = $state(false);

	// All three scalars come back in a single `or`-unioned instant query.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(client, {
				count: `count(count by (cpu, instance) (node_cpu_seconds_total{instance=~"${fqdn}"}))`,
				using: `sum(irate(node_cpu_seconds_total{instance=~"${fqdn}",mode!="idle"}[6m]))`,
				total: `sum(irate(node_cpu_seconds_total{instance=~"${fqdn}"}[6m]))`
			});
			cpuCount = r.count[0]?.value?.value ?? null;
			usingVal = r.using[0]?.value?.value ?? null;
			totalVal = r.total[0]?.value?.value ?? null;
		} catch {
			cpuCount = null;
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
	const subLine = $derived(`${cpuCount ?? 'N/A'} ${m.cpu()}`);
</script>

<KpiCard
	title={m.cpu()}
	description={m.node_detail_cpu_description()}
	tooltip={m.node_detail_cpu_tooltip()}
	icon={CpuIcon}
	{isLoaded}
	{isEmpty}
>
	<KpiRatioValue {pct} {subLine} />
</KpiCard>

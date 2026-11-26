<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { CommitBars, NUM, Panel, widgetState } from '$lib/components/dashboard/kit';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { AIDAPTIV_CACHE_DEVICE_CLASS, fetchCombinedInstantOrNull } from '$lib/prometheus';

	import { CAPACITY_THRESHOLDS } from './format';
	import ScopeLabel from './scope-label.svelte';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Raw Ceph capacity: every OSD's bytes, before replication. `max`, not `sum`: only the active
	// mgr reports these, and a second scrape of it must not double the cluster.
	let cephTotal = $state<number>();
	let cephUsedPct = $state<number>();
	// The aiDAPTIVCache drives, from TopoLVM — the same series the old aiDAPTIV tile read.
	let aidaptivPct = $state<number>();
	let aidaptivTotal = $state<number>();
	let failed = $state(false);

	const AIDAPTIV = `{device_class="${AIDAPTIV_CACHE_DEVICE_CLASS}"}`;
	const AIDAPTIV_TOTAL = `sum(topolvm_volumegroup_size_bytes${AIDAPTIV})`;
	const AIDAPTIV_FREE = `sum(topolvm_volumegroup_available_bytes${AIDAPTIV})`;

	async function fetch() {
		const r = await fetchCombinedInstantOrNull(prometheusDriver, {
			cephTotal: 'max(ceph_cluster_total_bytes)',
			cephUsedPct: '100 * max(ceph_cluster_total_used_raw_bytes) / max(ceph_cluster_total_bytes)',
			aidaptivTotal: AIDAPTIV_TOTAL,
			aidaptivPct: `100 * (${AIDAPTIV_TOTAL} - ${AIDAPTIV_FREE}) / ${AIDAPTIV_TOTAL}`
		});
		failed = r === null;
		if (!r) return;
		const pick = (key: string) => {
			const value = r[key][0]?.value?.value;
			return value === undefined ? undefined : Number(value);
		};
		cephTotal = pick('cephTotal');
		cephUsedPct = pick('cephUsedPct');
		aidaptivTotal = pick('aidaptivTotal');
		aidaptivPct = pick('aidaptivPct');
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	const hasData = $derived(cephTotal !== undefined || aidaptivTotal !== undefined);
	// Each row only when its stack reports: a cluster without the aiDAPTIV drives shows Ceph alone.
	const rows = $derived([
		...(cephTotal === undefined ? [] : [{ label: m.cluster_used(), value: cephUsedPct }]),
		...(aidaptivTotal === undefined
			? []
			: // The short name: the row's label column holds eight characters.
				[{ label: 'aiDAPTIV', value: aidaptivPct }])
	]);
</script>

<Panel
	title={m.storage()}
	tooltip={m.cluster_dashboard_storage_tooltip()}
	state={widgetState(isLoaded, hasData, failed && !hasData)}
	class="min-h-58"
>
	{#snippet actions()}
		<ScopeLabel label="Ceph" />
	{/snippet}
	{@const raw = cephTotal === undefined ? undefined : formatCapacity(cephTotal)}
	<p class="text-[1.75rem] leading-8 tracking-tight {NUM}">
		{raw?.value ?? '—'}<span class="ml-1.5 text-sm tracking-normal text-muted-foreground"
			>{raw ? m.cluster_raw({ unit: raw.unit }) : ''}</span
		>
	</p>
	<CommitBars
		class="mt-auto pt-3"
		tickLabel={m.total()}
		thresholds={CAPACITY_THRESHOLDS}
		summary={false}
		{rows}
	/>
</Panel>

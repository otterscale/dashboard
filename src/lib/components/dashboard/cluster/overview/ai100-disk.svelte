<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import ResourceCard from '$lib/components/dashboard/shared/resource-card.svelte';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		ai100DiskRate,
		AIDAPTIV_CACHE_DEVICE_CLASS,
		deviceClassLabel,
		fetchCombinedInstant
	} from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let usedPct: number | undefined = $state(undefined);
	let freeBytes: number | undefined = $state(undefined);
	let totalBytes: number | undefined = $state(undefined);
	// From node_exporter, not TopoLVM — the volume group series only report capacity. Read/write
	// throughput lives in the node table, where it can be attributed to a machine.
	let busyPct: number | undefined = $state(undefined);

	// TopoLVM reports size and available per volume group; used is the difference, since it emits
	// no used series of its own. Scoped to the AI100's device class rather than summing whatever
	// else a node exposes. Absent unless the phison-topolvm module sets
	// `topolvm.node.prometheus.podMonitor.enabled`, in which case the card renders empty.
	const SELECTOR = `{device_class="${AIDAPTIV_CACHE_DEVICE_CLASS}"}`;
	const TOTAL = `sum(topolvm_volumegroup_size_bytes${SELECTOR})`;
	const FREE = `sum(topolvm_volumegroup_available_bytes${SELECTOR})`;

	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				usedPct: `100 * (${TOTAL} - ${FREE}) / ${TOTAL}`,
				freeBytes: FREE,
				totalBytes: TOTAL,
				// Fraction of wall-clock spent servicing I/O; averaged, so a fleet reads as "how saturated
				// is a typical drive" rather than a number above 100.
				busyPct: `100 * avg(${ai100DiskRate('node_disk_io_time_seconds_total')})`
			});
			usedPct = r.usedPct[0]?.value?.value ?? undefined;
			freeBytes = r.freeBytes[0]?.value?.value ?? undefined;
			totalBytes = r.totalBytes[0]?.value?.value ?? undefined;
			busyPct = r.busyPct[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch AI100 disk usage:', error);
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

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	// A non-numeric sample would reach formatCapacity() and print "NaN KB".
	const capacity = $derived.by(() => {
		const total = Number(totalBytes);
		if (!Number.isFinite(total)) return { value: '—' };
		const { value, unit } = formatCapacity(total);
		return { value, unit };
	});
	const free = $derived.by(() => {
		if (freeBytes === undefined) return undefined;
		const { value, unit } = formatCapacity(Number(freeBytes));
		return `${value} ${unit}`;
	});
</script>

<!-- Gate on capacity, not usage: it exists whenever TopoLVM manages a pool, so an empty drive
     renders 0% instead of an empty state. -->
<ResourceCard
	title={deviceClassLabel(AIDAPTIV_CACHE_DEVICE_CLASS)}
	description={m.cluster_dashboard_ai100_description()}
	tooltip={m.cluster_dashboard_ai100_tooltip()}
	state={!isLoaded
		? 'loading'
		: totalBytes === undefined || totalBytes === null
			? 'empty'
			: 'ready'}
	total={capacity}
	rows={[
		{ label: m.usage(), percent: Number(usedPct ?? 0) },
		// A drive doing work is the point, not a pressure signal.
		{ label: m.disk_busy(), percent: busyPct, kind: 'neutral' }
	]}
	notes={free ? [{ label: m.free(), value: free }] : []}
/>

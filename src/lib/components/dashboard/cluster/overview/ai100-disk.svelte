<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		ai100DiskRate,
		AIDAPTIV_CACHE_DEVICE_CLASS,
		deviceClassLabel,
		fetchCombinedInstantOrNull
	} from '$lib/prometheus';

	import ResourceCard from './resource-card.svelte';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	function finite(value: unknown): number | undefined {
		const n = Number(value);
		return value !== undefined && value !== null && Number.isFinite(n) ? n : undefined;
	}

	// TopoLVM reports size and available per volume group; used is the difference, since it emits
	// no used series of its own. Scoped to the AI100's device class rather than summing whatever
	// else a node exposes. Absent unless the phison-topolvm module sets
	// `topolvm.node.prometheus.podMonitor.enabled`, in which case the card renders empty.
	const SELECTOR = `{device_class="${AIDAPTIV_CACHE_DEVICE_CLASS}"}`;
	const TOTAL = `sum(topolvm_volumegroup_size_bytes${SELECTOR})`;
	const FREE = `sum(topolvm_volumegroup_available_bytes${SELECTOR})`;

	const disk = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					usedPct: `100 * (${TOTAL} - ${FREE}) / ${TOTAL}`,
					freeBytes: FREE,
					totalBytes: TOTAL,
					// Fraction of wall-clock spent servicing I/O; averaged, so a fleet reads as "how saturated
					// is a typical drive" rather than a number above 100.
					busyPct: `100 * avg(${ai100DiskRate('node_disk_io_time_seconds_total')})`
				})
			);
			// Gate on capacity, not usage: it exists whenever TopoLVM manages a pool, so an empty
			// drive renders 0% instead of an empty state.
			if (r.totalBytes[0]?.value?.value == null) return null;
			return {
				// A non-numeric sample would reach formatCapacity() and print "NaN KB".
				totalBytes: finite(r.totalBytes[0]?.value?.value),
				usedPct: finite(r.usedPct[0]?.value?.value),
				freeBytes: finite(r.freeBytes[0]?.value?.value),
				// From node_exporter, not TopoLVM: the volume group series only report capacity.
				// Read/write throughput lives in the node table, where it can be attributed to a machine.
				busyPct: finite(r.busyPct[0]?.value?.value)
			};
		},
		() => isReloading
	);

	const total = $derived(
		disk.data?.totalBytes === undefined ? undefined : formatCapacity(disk.data.totalBytes)
	);
	const free = $derived(
		disk.data?.freeBytes === undefined ? undefined : formatCapacity(disk.data.freeBytes)
	);
</script>

<ResourceCard
	title={deviceClassLabel(AIDAPTIV_CACHE_DEVICE_CLASS)}
	description={m.cluster_dashboard_ai100_description()}
	info={m.cluster_dashboard_ai100_tooltip()}
	status={disk.status}
	stale={disk.stale}
	emptyTitle={m.dash_not_installed()}
	capacity={total ? String(total.value) : '—'}
	unit={total?.unit}
	capacityLabel={m.dash_capacity()}
>
	<Meter label={m.usage()} percent={disk.data?.usedPct ?? 0} swatch="bg-chart-1" />
	{#if disk.data?.busyPct !== undefined}
		<!-- Uncoloured: a drive doing work is the point, not a pressure signal. -->
		<Meter label={m.disk_busy()} percent={disk.data.busyPct} level="neutral" swatch="bg-chart-4" />
	{/if}
	{#if free}
		<Meter label={m.free()} value={`${free.value} ${free.unit}`} percent={null} />
	{/if}
</ResourceCard>

<script lang="ts">
	import HardDriveIcon from '@lucide/svelte/icons/hard-drive';
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
					using: `sum(node_filesystem_size_bytes{fstype!="rootfs",instance=~"${fqdn}",mountpoint="/"}) - sum(node_filesystem_avail_bytes{fstype!="rootfs",instance=~"${fqdn}",mountpoint="/"})`,
					total: `sum(node_filesystem_size_bytes{fstype!="rootfs",instance=~"${fqdn}",mountpoint="/"})`
				})
			);
			const using: number | null = r.using[0]?.value?.value ?? null;
			const total: number | null = r.total[0]?.value?.value ?? null;
			// A root filesystem of size zero is a missing reading, not an empty disk.
			if (using === null || total === null || Number(total) === 0) return null;
			return { using: Number(using), total: Number(total) };
		},
		() => isReloading ?? false
	);

	const pct = $derived(
		usage.data && usage.data.total > 0 ? (usage.data.using / usage.data.total) * 100 : 0
	);
	const subLine = $derived.by(() => {
		const used = formatCapacity(usage.data?.using ?? 0);
		const total = formatCapacity(usage.data?.total ?? 0);
		return `${used.value} ${used.unit} / ${total.value} ${total.unit}`;
	});
</script>

<KpiRatioValue
	title={m.file_system()}
	description={m.node_detail_filesystem_description()}
	tooltip={m.node_detail_filesystem_tooltip()}
	icon={HardDriveIcon}
	status={usage.status}
	stale={usage.stale}
	{pct}
	{subLine}
/>

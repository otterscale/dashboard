<script lang="ts">
	import ClockIcon from '@lucide/svelte/icons/clock';
	import type { PrometheusDriver } from 'prometheus-query';

	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { m } from '$lib/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { fetchCombinedInstantOrNull } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	// Both scalars come back in a single `or`-unioned instant query.
	const uptime = useLoadable(
		async () => {
			const r = orThrow(
				await fetchCombinedInstantOrNull(prometheusDriver, {
					uptime: `time() - min(kube_node_created{})`,
					create: `min(kube_node_created{}) * 1000`
				})
			);
			const seconds = Number(r.uptime[0]?.value?.value);
			if (!Number.isFinite(seconds)) return null;
			const created = Number(r.create[0]?.value?.value);
			return { seconds, created: Number.isFinite(created) ? created : undefined };
		},
		() => isReloading
	);

	// The creation date in the app's language. Nothing at all when there is no
	// creation time: a date is never made out of a missing value.
	const since = $derived.by(() => {
		const created = uptime.data?.created;
		if (created === undefined) return undefined;
		const date = new Date(created);
		return Number.isNaN(date.getTime()) ? undefined : date.toLocaleDateString(getLocale());
	});

	function formatUptime(seconds: number): string {
		const days = Math.floor(seconds / (24 * 60 * 60));
		if (days > 0) return `${days} ${m.day()}`;

		const hours = Math.floor(seconds / (60 * 60));
		if (hours > 0) return `${hours} ${m.hour()}`;

		const minutes = Math.floor(seconds / 60);
		if (minutes > 0) return `${minutes} ${m.minute()}`;

		return `${Math.floor(seconds)} ${m.second()}`;
	}
</script>

<StatCard label={m.uptime()} icon={ClockIcon} status={uptime.status} stale={uptime.stale}>
	<span class="truncate">{formatUptime(uptime.data?.seconds ?? 0)}</span>
	{#snippet detail()}
		{#if since}{m.dash_since({ date: since })}{/if}
	{/snippet}
</StatCard>

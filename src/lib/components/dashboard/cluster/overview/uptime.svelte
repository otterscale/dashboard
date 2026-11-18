<script lang="ts">
	import ClockIcon from '@lucide/svelte/icons/clock';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { m } from '$lib/messages';
	import { fetchCombinedInstant } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let uptime: SampleValue | undefined = $state(undefined);
	let create_time: SampleValue | undefined = $state(undefined);

	// Both scalars come back in a single `or`-unioned instant query.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				uptime: `time() - min(kube_node_created{})`,
				create: `min(kube_node_created{}) * 1000`
			});
			uptime = r.uptime[0]?.value ?? undefined;
			create_time = r.create[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch uptime:', error);
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

	function formatUptime(seconds: number): string {
		const days = Math.floor(seconds / (24 * 60 * 60));
		if (days > 0) return `${days} ${m.day()}`;

		const hours = Math.floor(seconds / (60 * 60));
		if (hours > 0) return `${hours} ${m.hour()}`;

		const minutes = Math.floor(seconds / 60);
		if (minutes > 0) return `${minutes} ${m.minute()}`;

		return `${seconds} ${m.second()}`;
	}
</script>

<StatTile
	label={m.uptime()}
	icon={ClockIcon}
	loading={!isLoaded}
	value={!uptime ? null : uptime.value ? formatUptime(Number(uptime.value)) : 'N/A'}
	tone={uptime ? 'primary' : 'muted'}
	hint={!uptime ? m.no_data_display() : new Date(Number(create_time)).toLocaleDateString()}
/>

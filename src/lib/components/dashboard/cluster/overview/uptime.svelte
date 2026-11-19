<script lang="ts">
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { fetchCombinedOrThrow } from '$lib/components/dashboard/shared/query';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { m } from '$lib/messages';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let uptime: SampleValue | undefined = $state(undefined);
	let create_time: SampleValue | undefined = $state(undefined);

	// Both scalars come back in a single `or`-unioned instant query.
	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		try {
			const r = await fetchCombinedOrThrow(prometheusDriver, {
				uptime: `time() - min(kube_node_created{})`,
				create: `min(kube_node_created{}) * 1000`
			});
			uptime = r.uptime[0]?.value ?? undefined;
			create_time = r.create[0]?.value?.value ?? undefined;
			failed = false;
		} catch (error) {
			failed = true;
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
	state={!isLoaded ? 'loading' : failed ? 'error' : !uptime ? 'empty' : 'ready'}
	onretry={fetch}
	value={uptime?.value ? formatUptime(Number(uptime.value)) : 'N/A'}
	hint={Number.isFinite(Number(create_time))
		? new Date(Number(create_time)).toLocaleDateString()
		: undefined}
/>

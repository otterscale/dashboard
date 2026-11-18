<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { m } from '$lib/messages';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let version: string | undefined = $state(undefined);
	let platform: string | undefined = $state(undefined);
	async function fetchBuildInformation() {
		const response = await prometheusDriver.instantQuery(`kubernetes_build_info{job="apiserver"}`);
		version = response.result[0]?.metric?.labels?.git_version ?? undefined;
		platform = response.result[0]?.metric?.labels?.platform ?? undefined;
	}

	async function fetch() {
		try {
			await fetchBuildInformation();
		} catch (error) {
			console.error('Failed to fetch build info:', error);
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
</script>

<StatTile
	label={m.information()}
	icon={InfoIcon}
	loading={!isLoaded}
	value={version ?? null}
	tone={version ? 'primary' : 'muted'}
	hint={!version ? m.no_data_display() : (platform ?? 'N/A')}
/>

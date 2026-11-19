<script lang="ts">
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import StatTile from '$lib/components/dashboard/shared/stat-tile.svelte';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace = '',
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace?: string;
		isReloading: boolean;
	} = $props();

	let deployments: SampleValue | undefined = $state(undefined);
	async function fetchdeployments() {
		const ns = (namespace ?? '').trim();
		const nsFilter = ns ? `,namespace="${escapePromqlStringLiteral(ns)}"` : '';
		const response = await prometheusDriver.instantQuery(
			`count(kube_deployment_created{container!=""${nsFilter}})`
		);
		deployments = response.result[0]?.value ?? undefined;
	}

	// Whether the last fetch threw: a widget that failed says so, instead of reading as empty.
	let failed = $state(false);

	async function fetch() {
		try {
			await fetchdeployments();
			failed = false;
		} catch (error) {
			failed = true;
			console.error('Failed to fetch cluster nodes:', error);
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
	label={m.deployments()}
	state={!isLoaded ? 'loading' : failed ? 'error' : deployments === undefined ? 'empty' : 'ready'}
	onretry={fetch}
	value={deployments?.value}
/>

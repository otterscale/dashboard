<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import ServerIcon from '@lucide/svelte/icons/server';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		cluster,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; cluster: string; isReloading: boolean } = $props();

	let clusterNodes: SampleValue | undefined = $state(undefined);
	async function fetchClusterNodes() {
		const response = await prometheusDriver.instantQuery(`count(kube_node_role{container!=""})`);
		clusterNodes = response.result[0]?.value ?? undefined;
	}

	async function fetch() {
		try {
			await fetchClusterNodes();
		} catch (error) {
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

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<ServerIcon
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header>
		<Card.Title>{m.node()}</Card.Title>
		<Card.Description class="flex h-6 items-center"
			>{m.cluster_dashboard_node_description()}</Card.Description
		>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if !String(clusterNodes)}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="my-auto">
			<p class="text-3xl font-bold">
				{clusterNodes?.value !== undefined ? clusterNodes?.value : 'N/A'}
			</p>
		</Card.Content>
	{/if}
</Card.Root>

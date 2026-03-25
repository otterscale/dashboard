<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import InfoIcon from '@lucide/svelte/icons/info';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		cluster,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; cluster: string; isReloading: boolean } = $props();

	let consumption: string | undefined = $state(undefined);
	async function fetchConsumption() {
		const response = await prometheusDriver.instantQuery(`sum(DCGM_FI_DEV_POWER_USAGE{})`);
		consumption = response.result[0]?.value?.value ?? undefined;
	}

	const reloadManager = new ReloadManager(fetchConsumption);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetchConsumption();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<InfoIcon
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header>
		<Card.Title>{m.power_usage()}</Card.Title>
		<Card.Description class="text-md flex h-6 items-center"
			>{m.cluster_dashboard_power_usage_description()}</Card.Description
		>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if !consumption}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content>
			<p class="text-3xl">{Number(consumption).toFixed(2)} Watt</p>
		</Card.Content>
	{/if}
</Card.Root>

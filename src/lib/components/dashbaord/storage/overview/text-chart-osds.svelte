<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import DiscIcon from '@lucide/svelte/icons/disc';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';

	// Props
	let {
		client,
		cluster: _,
		isReloading = $bindable()
	}: { client: PrometheusDriver; cluster: string; isReloading: boolean } = $props();
	void _;

	// Constants
	const CHART_TITLE = m.osds();
	const CHART_DESCRIPTION = 'In & Up';

	// Queries
	const queries = $derived({
		in: `sum(ceph_osd_in{})`,
		up: `sum(ceph_osd_up{})`,
		total: `count(ceph_osd_metadata{})`
	});

	// Auto Update
	let response = $state({} as { inNumber: number; upNumber: number; totalNumber: number });
	let isLoading = $state(true);
	const reloadManager = new ReloadManager(fetch);

	// Data fetching function
	async function fetch() {
		const [inResponse, upResponse, totalResponse] = await Promise.all([
			client.instantQuery(queries.in),
			client.instantQuery(queries.up),
			client.instantQuery(queries.total)
		]);

		const inValue = inResponse.result[0]?.value?.value;
		const upValue = upResponse.result[0]?.value?.value;
		const totalValue = totalResponse.result[0]?.value?.value;

		response = {
			inNumber: inValue,
			upNumber: upValue,
			totalNumber: totalValue
		};
	}

	// Effects
	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	onMount(async () => {
		await fetch();
		isLoading = false;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<DiscIcon
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header class="items-center">
		<Card.Title>{CHART_TITLE}</Card.Title>
		<Card.Description>{CHART_DESCRIPTION}</Card.Description>
	</Card.Header>
	{#if isLoading}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if response === undefined}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="text-3xl">{`${response.inNumber} / ${response.upNumber}`}</Card.Content>
	{/if}
</Card.Root>

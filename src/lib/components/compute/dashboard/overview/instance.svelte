<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ContainerIcon from '@lucide/svelte/icons/container';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { SampleValue } from 'prometheus-query';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		cluster,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; cluster: string; isReloading: boolean } = $props();

	let instances: SampleValue | undefined = $state(undefined);
	async function fetchInstances() {
		const response = await prometheusDriver.instantQuery(
			`count(kubevirt_vmi_info{juju_model="${cluster}"})`
		);
		instances = response.result[0]?.value ?? undefined;
	}

	let isLoaded = $state(false);
	async function fetch() {
		try {
			await fetchInstances();
		} catch (error) {
			console.error('Failed to fetch instance data:', error);
		}
	}

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	const reloadManager = new ReloadManager(fetch);

	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<ContainerIcon
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header>
		<Card.Title>{m.instances()}</Card.Title>
		<Card.Description>{m.running()}</Card.Description>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if !instances}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="text-3xl">{instances.value}</Card.Content>
	{/if}
</Card.Root>

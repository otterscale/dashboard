<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { SampleValue } from 'prometheus-query';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; namespace: string; isReloading: boolean } = $props();

	let virtualMachines: SampleValue | undefined = $state(undefined);
	async function fetchVirtualMachines() {
		const response = await prometheusDriver.instantQuery(
			`count(kubevirt_vm_starting_status_last_transition_timestamp_seconds{exported_namespace="${namespace}"})`
		);
		virtualMachines = response.result[0]?.value ?? undefined;
	}

	async function fetch() {
		try {
			await fetchVirtualMachines();
		} catch (error) {
			console.error('Failed to fetch virtual machine data:', error);
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
	<LayoutGridIcon
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header>
		<Card.Title>{m.virtual_machines()}</Card.Title>
		<Card.Description>{m.starting()}</Card.Description>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if !virtualMachines}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="text-3xl">{virtualMachines.value}</Card.Content>
	{/if}
</Card.Root>

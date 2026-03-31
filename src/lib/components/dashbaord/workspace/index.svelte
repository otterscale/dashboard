<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import * as Item from '$lib/components/ui/item';
	import { m } from '$lib/paraglide/messages';

	import { workspaceOverviewWidgets } from './overview/widgets';

	let {
		cluster,
		namespace
	}: {
		cluster: string;
		namespace: string;
	} = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);

	const widgets = $derived(
		workspaceOverviewWidgets.map((w) => ({
			...w,
			props: { namespace }
		}))
	);

	onMount(async () => {
		try {
			prometheusDriver = new PrometheusDriver({
				endpoint: `/proxy/${cluster}/prometheus`,
				baseURL: '/api/v1',
				headers: {
					'x-proxy-target': 'api'
				}
			});
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
		}
	});

	onDestroy(() => {
		isReloading = false;
	});
</script>

<div class="space-y-4">
	<div class="flex items-end justify-between gap-4">
		<Item.Root class="p-0">
			<Item.Content class="text-left">
				<Item.Title class="text-xl font-bold">
					{m.workspace_dashboard_title()}
				</Item.Title>
				<Item.Description class="text-base">
					{m.workspace_dashboard_description()}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
	<div class="mx-auto grid w-full gap-6">
		{#if prometheusDriver}
			<div class="flex flex-wrap items-center justify-end gap-4">
				<Reloader bind:checked={isReloading} />
			</div>
			<div class="grid auto-rows-auto grid-cols-2 gap-4 pt-4 md:gap-6 lg:grid-cols-12">
				<WidgetGrid {widgets} {prometheusDriver} {cluster} bind:isReloading />
			</div>
		{:else if cluster}
			<div class="flex min-h-[400px] w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin text-muted-foreground" />
			</div>
		{:else}
			<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
				<p>{m.no_data_display()}</p>
			</div>
		{/if}
	</div>
</div>

<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import * as Item from '$lib/components/ui/item';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

	import { widgets } from './overview/widgets';

	let { cluster, namespace }: { cluster: string; namespace: string } = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);

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
					{m.compute_status()}
				</Item.Title>
				<Item.Description class="text-base">
					{m.compute_dashboard_description()}
				</Item.Description>
			</Item.Content>
		</Item.Root>
	</div>
	{#if prometheusDriver}
		<div class="mx-auto grid w-full gap-6">
			<Tabs.Root value="overview">
				<div class="flex justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics" disabled>{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<Reloader bind:checked={isReloading} />
				</div>
				<Tabs.Content
					value="overview"
					class="grid auto-rows-auto grid-cols-2 gap-5 pt-4 md:grid-cols-4 lg:grid-cols-12"
				>
					<WidgetGrid {widgets} {prometheusDriver} {cluster} {namespace} bind:isReloading />
				</Tabs.Content>
				<Tabs.Content value="analytics"></Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</div>

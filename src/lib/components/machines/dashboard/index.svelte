<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import { Dashboard } from '$lib/components/dashbaord/cluster/analytics';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

	import { widgets } from './overview/widgets';

	let { cluster }: { cluster: string } = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let selectedTab = $state('overview');

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

<main class="space-y-4 py-4">
	<div class="mx-auto grid w-full gap-6">
		<div class="grid gap-1">
			<h1 class="text-2xl font-bold tracking-tight md:text-3xl">{m.dashboard()}</h1>
			<p class="text-muted-foreground">
				{m.machine_dashboard_description()}
			</p>
		</div>

		{#if prometheusDriver}
			<Tabs.Root bind:value={selectedTab}>
				<div class="flex justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics">{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<Reloader bind:checked={isReloading} />
				</div>
				<Tabs.Content
					value="overview"
					class="grid auto-rows-auto grid-cols-2 gap-5 pt-4 md:grid-cols-4 lg:grid-cols-12"
				>
					<WidgetGrid {widgets} {prometheusDriver} {cluster} bind:isReloading />
				</Tabs.Content>
				<Tabs.Content value="analytics">
					<Dashboard {cluster} client={prometheusDriver} />
				</Tabs.Content>
			</Tabs.Root>
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
</main>

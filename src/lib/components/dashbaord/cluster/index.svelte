<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { LoaderCircle } from '@lucide/svelte';
	import { onDestroy, onMount } from 'svelte';

	import { Reloader } from '$lib/components/custom/reloader';
	import { WidgetGrid } from '$lib/components/custom/widget-grid';
	import { m } from '$lib/paraglide/messages';

	import { widgets } from './overview/widgets';

	let { cluster }: { cluster: string } = $props();

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

<main class="space-y-4 py-4">
	<div class="mx-auto grid w-full gap-6">
		<div class="grid gap-1">
			<h1 class="text-2xl font-bold tracking-tight md:text-3xl">{m.overview()}</h1>
			<p class="text-muted-foreground">
				{m.k8s_overview_description()}
			</p>
		</div>

		{#if prometheusDriver}
			<div class="flex justify-end gap-2">
				<Reloader bind:checked={isReloading} />
			</div>
			<div class="grid auto-rows-auto grid-cols-2 gap-5 pt-4 md:grid-cols-4 lg:grid-cols-12">
				<WidgetGrid {widgets} {prometheusDriver} {cluster} bind:isReloading />
			</div>
		{:else if cluster}
			<div class="flex min-h-[400px] w-full items-center justify-center">
				<LoaderCircle class="size-12 text-muted-foreground animate-spin" />
			</div>
		{:else}
			<div class="flex min-h-[400px] w-full items-center justify-center text-muted-foreground">
				<p>{m.no_data_display()}</p>
			</div>
		{/if}
	</div>
</main>

<script lang="ts">
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import Reloader from '$lib/components/custom/reloader/reloader.svelte';
	import { Overview } from '$lib/components/storage/dashboard/overview';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

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
	{#if prometheusDriver}
		<div class="mx-auto grid w-full gap-6">
			<div class="grid gap-1">
				<h1 class="text-2xl font-bold tracking-tight md:text-3xl">{m.storage()}</h1>
				<p class="text-muted-foreground">
					{m.storage_dashboard_description()}
				</p>
			</div>
			<Tabs.Root value="overview">
				<div class="flex justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics" disabled>{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<Reloader bind:checked={isReloading} />
				</div>
				<Tabs.Content value="overview">
					<Overview client={prometheusDriver} {cluster} bind:isReloading />
				</Tabs.Content>
				<Tabs.Content value="analytics">
					<!-- <Analytics client={prometheusDriver} {cluster} /> -->
				</Tabs.Content>
			</Tabs.Root>
		</div>
	{/if}
</main>

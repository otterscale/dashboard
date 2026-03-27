<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { NamespacePicker } from '$lib/components/custom/namespace-picker';
	import { Reloader } from '$lib/components/custom/reloader';
	import { Dashboard } from '$lib/components/models/dashboard/analytics';
	import ModelPicker from '$lib/components/models/dashboard/analytics/model-picker.svelte';
	import { Overview } from '$lib/components/models/dashboard/overview/index';
	import * as Tabs from '$lib/components/ui/tabs';
	import { m } from '$lib/paraglide/messages';

	let {
		cluster,
		currentWorkspace = '',
		defaultNamespace = '',
		isClusterAdmin = false
	}: {
		cluster: string;
		/** Name of the currently active workspace (for default picker selection) */
		currentWorkspace?: string;
		/** Workspace namespace used as initial namespace state */
		defaultNamespace?: string;
		isClusterAdmin?: boolean;
	} = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let selectedTab = $state('overview');
	/** Currently selected namespace; empty string means "all namespaces" */
	let selectedNamespace = $state<string | undefined>(
		defaultNamespace !== '' ? defaultNamespace : undefined
	);
	/** vLLM analytics model filter; lives next to NamespacePicker so chart grid does not shift vertically */
	let selectedModel = $state<string | undefined>(undefined);

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
				<h1 class="text-2xl font-bold tracking-tight md:text-3xl">{m.dashboard()}</h1>
				<p class="text-muted-foreground">
					{m.llm_dashboard_description()}
				</p>
			</div>

			<Tabs.Root bind:value={selectedTab}>
				<div class="flex justify-between gap-2">
					<Tabs.List>
						<Tabs.Trigger value="overview">{m.overview()}</Tabs.Trigger>
						<Tabs.Trigger value="analytics">{m.analytics()}</Tabs.Trigger>
					</Tabs.List>
					<div class="flex flex-wrap items-center justify-end gap-2">
						{#if selectedTab === 'analytics'}
							<ModelPicker {cluster} namespace={selectedNamespace} bind:selectedModel />
						{/if}
						<NamespacePicker
							{cluster}
							{isClusterAdmin}
							{currentWorkspace}
							bind:namespace={selectedNamespace}
						/>
						<Reloader bind:checked={isReloading} />
					</div>
				</div>
				<Tabs.Content value="overview">
					{#if selectedTab === 'overview'}
						{#key selectedNamespace}
							<Overview
								{prometheusDriver}
								namespace={selectedNamespace ?? ''}
								{cluster}
								bind:isReloading
							/>
						{/key}
					{/if}
				</Tabs.Content>
				<Tabs.Content value="analytics">
					{#if selectedTab === 'analytics'}
						{#key selectedNamespace}
							<Dashboard
								{cluster}
								namespace={selectedNamespace}
								client={prometheusDriver}
								bind:selectedModel
								bind:isReloading
							/>
						{/key}
					{/if}
				</Tabs.Content>
			</Tabs.Root>
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
</main>

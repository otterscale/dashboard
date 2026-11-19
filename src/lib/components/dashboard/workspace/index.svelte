<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import AutoUpdate from '$lib/components/dashboard/shared/auto-update.svelte';
	import { cardClass } from '$lib/components/dashboard/shared/status';
	import WidgetState from '$lib/components/dashboard/shared/widget-state.svelte';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { m } from '$lib/messages';
	import { dashboardBody, sharedMetrics, workspacePrometheusDriver } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import PodRolloutHealth from './overview/pod-rollout-health.svelte';
	import ResourceQuota from './overview/resource-quota.svelte';
	import Storage from './overview/storage.svelte';
	import WorkloadHealth from './overview/workload-health.svelte';

	let {
		cluster,
		namespace,
		canViewClusterMetrics = false
	}: {
		cluster: string;
		namespace: string;
		canViewClusterMetrics?: boolean;
	} = $props();

	let isReloading = $state(true);
	let prometheusDriver = $state<PrometheusDriver | null>(null);
	let initialized = $state(false);
	const body = $derived(
		dashboardBody({
			hasDriver: prometheusDriver !== null,
			initialized,
			cluster,
			namespace: namespace
		})
	);

	const shared = $derived(sharedMetrics(cluster, namespace));

	onMount(async () => {
		try {
			prometheusDriver = workspacePrometheusDriver(cluster, namespace, canViewClusterMetrics);
		} catch (error) {
			console.error('Failed to initialize Prometheus driver:', error);
		}
		initialized = true;
	});

	onDestroy(() => {
		isReloading = false;
	});

	// The page is one twelve-column grid with a 20px gap. Columns follow the width
	// of the content area (a container query), so the layout also holds when the
	// sidebar is open, collapsed or a drawer. Rows, by `order`:
	//   1  the four stat tiles          (1 column, 2x2, then one row)
	//   2  quota + workload health      (stacked, then 7 / 5)
	//   3  storage + the three lists    (1 column, 2x2, then one row)
	const grid = 'grid grid-cols-12 gap-5';
	const statsRow = 'order-1 col-span-full grid grid-cols-1 gap-5 @md:grid-cols-2 @2xl:grid-cols-4';
	const quotaCell = 'order-2 col-span-full min-w-0 @2xl:col-span-7';
	const workloadCell = 'order-2 col-span-full min-w-0 @2xl:col-span-5';
	const detailCell = 'order-3 col-span-full min-w-0 @md:col-span-6 @4xl:col-span-3';
</script>

<div class="@container flex flex-col gap-5">
	<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
		<div class="grid min-w-0 gap-1">
			<h1 class="text-xl leading-7 font-medium tracking-tight">
				{m.workspace_dashboard_title()}
			</h1>
			<p class="text-sm text-pretty text-muted-foreground">
				{m.workspace_dashboard_description()}
			</p>
		</div>
		{#if prometheusDriver}
			<AutoUpdate bind:checked={isReloading} class="ms-auto min-h-8" />
		{/if}
	</div>

	{#if prometheusDriver}
		<div class={grid}>
			<div class={quotaCell}>
				<ResourceQuota {prometheusDriver} {namespace} bind:isReloading />
			</div>
			<div class={workloadCell}>
				<WorkloadHealth {prometheusDriver} {cluster} {namespace} bind:isReloading />
			</div>
			<div class={detailCell}>
				<Storage {prometheusDriver} {namespace} {shared} bind:isReloading />
			</div>
			<PodRolloutHealth
				{prometheusDriver}
				{namespace}
				bind:isReloading
				statsClass={statsRow}
				listClass={detailCell}
			/>
		</div>
	{:else if body === 'loading'}
		<!-- The driver is not there yet: the page's outline, in the cards' own sizes. -->
		<div class={grid} aria-busy="true">
			<div class={statsRow}>
				{#each [0, 1, 2, 3] as index (index)}
					<div class={cn(cardClass, 'flex min-h-25 items-center gap-4 p-5')}>
						<Skeleton class="size-11 shrink-0 rounded-lg" />
						<div class="grid flex-1 gap-2">
							<Skeleton class="h-4 w-20" />
							<Skeleton class="h-6 w-24" />
						</div>
					</div>
				{/each}
			</div>
			{#each [quotaCell, workloadCell, detailCell, detailCell, detailCell, detailCell] as cell, index (index)}
				<div class={cell}>
					<div class={cn(cardClass, 'flex flex-col gap-5 p-5')}>
						<Skeleton class="h-5 w-32" />
						<Skeleton class="min-h-48 w-full flex-1" />
					</div>
				</div>
			{/each}
		</div>
	{:else}
		<div class={cn(cardClass, 'flex min-h-80 items-center justify-center')}>
			{#if body === 'no-namespace'}
				<WidgetState kind="empty" description={m.workspace_namespace_unknown()} />
			{:else}
				<WidgetState kind="empty" />
			{/if}
		</div>
	{/if}
</div>

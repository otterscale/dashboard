<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';
	import { cn } from '$lib/utils';

	// Props
	let { client, isReloading = $bindable() }: { client: PrometheusDriver; isReloading: boolean } =
		$props();

	// Constants
	const CHART_TITLE = m.storage_overcommit_title();
	const CHART_DESCRIPTION = m.storage_overcommit_description();

	// Thin provisioning lets total PVC requests exceed the physical pool; past
	// this ratio the number is highlighted as a warning.
	const WARN_RATIO = 3;

	const query = `
	sum(kube_persistentvolumeclaim_resource_requests_storage_bytes)
	/
	sum(ceph_cluster_total_bytes)
	`;

	// Auto Update
	let ratio = $state<number>();
	let isLoading = $state(true);
	const reloadManager = new ReloadManager(fetch);

	// Fetch function
	async function fetch(): Promise<void> {
		try {
			const queryResponse = await client.instantQuery(query);
			const value = parseFloat(queryResponse.result[0]?.value?.value);
			ratio = Number.isFinite(value) ? value : undefined;
		} catch (err) {
			console.error('Failed to fetch storage overcommit ratio:', err);
			ratio = undefined;
		}
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
	<ScaleIcon
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
	{:else if ratio === undefined}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content
			class={cn(
				'text-3xl',
				ratio >= WARN_RATIO && 'font-semibold text-amber-700 dark:text-amber-400'
			)}
		>
			{ratio.toFixed(1)}x
		</Card.Content>
	{/if}
</Card.Root>

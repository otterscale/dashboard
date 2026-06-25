<script lang="ts">
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ClockIcon from '@lucide/svelte/icons/clock';
	import Loader2Icon from '@lucide/svelte/icons/loader-2';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';
	import { fetchCombinedInstant } from '$lib/prometheus';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	let uptime: SampleValue | undefined = $state(undefined);
	let create_time: SampleValue | undefined = $state(undefined);

	// Both scalars come back in a single `or`-unioned instant query.
	async function fetch() {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, {
				uptime: `time() - min(kube_node_created{})`,
				create: `min(kube_node_created{}) * 1000`
			});
			uptime = r.uptime[0]?.value ?? undefined;
			create_time = r.create[0]?.value?.value ?? undefined;
		} catch (error) {
			console.error('Failed to fetch uptime:', error);
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

	function formatUptime(seconds: number): string {
		const days = Math.floor(seconds / (24 * 60 * 60));
		if (days > 0) return `${days} ${m.day()}`;

		const hours = Math.floor(seconds / (60 * 60));
		if (hours > 0) return `${hours} ${m.hour()}`;

		const minutes = Math.floor(seconds / 60);
		if (minutes > 0) return `${minutes} ${m.minute()}`;

		return `${seconds} ${m.second()}`;
	}
</script>

<Card.Root class="relative h-full min-h-[140px] gap-2 overflow-hidden">
	<ClockIcon
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header>
		<Card.Title>{m.uptime()}</Card.Title>
		<Card.Description class="flex h-6 items-center"
			>{new Date(Number(create_time)).toLocaleDateString()}</Card.Description
		>
	</Card.Header>
	{#if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Loader2Icon class="size-10 animate-spin" />
		</div>
	{:else if !uptime}
		<div class="flex h-full w-full flex-col items-center justify-center">
			<ChartColumnIcon class="size-6 animate-pulse text-muted-foreground" />
			<p class="p-0 text-xs text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="text-3xl font-bold">
			{uptime?.value ? formatUptime(Number(uptime.value)) : 'N/A'}
		</Card.Content>
	{/if}
</Card.Root>

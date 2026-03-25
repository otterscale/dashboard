<script lang="ts">
	import Icon from '@iconify/svelte';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import { formatDuration } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';

	let { client, fqdn }: { client: PrometheusDriver; fqdn: string } = $props();

	let uptime = $state<number | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		const query = `
			node_time_seconds{instance=~"${fqdn}"}
			-
			node_boot_time_seconds{instance=~"${fqdn}"}
		`;
		try {
			const response = await client.instantQuery(query);
			uptime = response.result[0]?.value?.value ?? null;
		} catch {
			hasError = true;
		}
		isLoading = false;
	});
</script>

<Statistics.Root type="count">
	<Statistics.Header>
		<Statistics.Title>{m.uptime()}</Statistics.Title>
	</Statistics.Header>
	<Statistics.Content class="min-h-20">
		{#if isLoading}
			<div class="flex h-[200px] w-full items-center justify-center">
				<Icon icon="svg-spinners:3-dots-bounce" class="m-8 size-8" />
			</div>
		{:else if hasError || uptime === null}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<Icon icon="ph:chart-bar-fill" class="size-24 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{@const duration = formatDuration(uptime)}
			<p class="flex h-[200px] items-center justify-center text-5xl font-semibold">
				{duration.value.toFixed(1)}
				{duration.unit}
			</p>
		{/if}
	</Statistics.Content>
</Statistics.Root>

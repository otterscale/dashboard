<script lang="ts">
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import { formatDuration } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';

	let { client, vmName }: { client: PrometheusDriver; vmName: string } = $props();

	let uptime = $state<number | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		try {
			// time since VM last transitioned to Running state (requires kubevirt >= 0.40)
			const response = await client.instantQuery(
				`avg(time() - kubevirt_vm_running_status_last_transition_timestamp_seconds{name=~"${vmName}"})`
			);
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
				<Loader2 class="m-8 size-8 animate-bounce" />
			</div>
		{:else if hasError || uptime === null}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartBar class="size-24 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{@const duration = formatDuration(uptime)}
			<p class="flex h-[200px] items-center justify-center text-5xl font-semibold">
				{duration.value.toLocaleString(undefined, {
					minimumFractionDigits: 1,
					maximumFractionDigits: 1
				})}
				{duration.unit}
			</p>
		{/if}
	</Statistics.Content>
</Statistics.Root>

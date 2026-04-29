<script lang="ts">
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { ArcChart, Text } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatCapacity, formatPercentage } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';

	let { client, vmName }: { client: PrometheusDriver; vmName: string } = $props();

	let domainVal = $state<number | null>(null);
	let availableVal = $state<number | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		try {
			const [domainRes, availableRes] = await Promise.all([
				client.instantQuery(`sum(kubevirt_vmi_memory_domain_bytes{name=~"${vmName}"})`),
				client.instantQuery(`sum(kubevirt_vmi_memory_available_bytes{name=~"${vmName}"})`)
			]);
			domainVal = domainRes.result[0]?.value?.value ?? null;
			availableVal = availableRes.result[0]?.value?.value ?? null;
		} catch {
			hasError = true;
		}
		isLoading = false;
	});
</script>

<Statistics.Root type="ratio">
	<Statistics.Header>
		<div class="flex justify-between gap-4">
			<Statistics.Title>{m.memory_usage()}</Statistics.Title>
			{#if domainVal !== null}
				{@const { value, unit } = formatCapacity(domainVal)}
				<div class="flex items-center gap-1 text-xl">
					<p class="font-bold">{value} {unit}</p>
				</div>
			{/if}
		</div>
	</Statistics.Header>
	<Statistics.Content class="min-h-20">
		{#if isLoading}
			<div class="flex h-[200px] w-full items-center justify-center">
				<LoaderCircle class="m-8 size-16 animate-spin" />
			</div>
		{:else if hasError || availableVal === null || domainVal === null || domainVal === 0}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartBar class="size-24 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{@const chartConfig = { data: { color: 'var(--chart-2)' } } satisfies Chart.ChartConfig}
			{@const usedVal = (domainVal as number) - (availableVal as number)}
			{@const value = usedVal / (domainVal as number)}
			{@const data = [{ value }]}
			<Chart.Container config={chartConfig} class="mx-auto my-auto aspect-square h-[200px] w-full">
				<ArcChart
					{data}
					innerRadius={-15}
					cornerRadius={15}
					range={[-120, 120]}
					maxValue={1}
					series={[{ key: 'data', color: chartConfig.data.color }]}
					props={{ arc: { track: { fill: 'var(--muted)' }, motion: 'tween' } }}
					tooltip={false}
				>
					{#snippet aboveMarks()}
						{@const percentage = formatPercentage(usedVal, domainVal as number, 1) ?? '—'}
						{@const { value: usedValue, unit: usedUnit } = formatCapacity(usedVal)}
						{@const { value: totalValue, unit: totalUnit } = formatCapacity(domainVal as number)}
						<Text
							value={`${percentage} %`}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-3xl! font-bold"
							dy={-15}
						/>
						<Text
							value={`${usedValue} ${usedUnit}/${totalValue} ${totalUnit}`}
							textAnchor="middle"
							verticalAnchor="middle"
							class="font-base text-md! text-muted-foreground"
							dy={15}
						/>
					{/snippet}
				</ArcChart>
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>

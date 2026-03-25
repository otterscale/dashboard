<script lang="ts">
	import { ChartBar, LoaderCircle } from '@lucide/svelte';
	import { ArcChart, Text } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatCapacity, formatPercentage } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';

	let { client, fqdn }: { client: PrometheusDriver; fqdn: string } = $props();

	let overallVal = $state<number | null>(null);
	let usingVal = $state<number | null>(null);
	let totalVal = $state<number | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		try {
			const [overallRes, usingRes, totalRes] = await Promise.all([
				client.instantQuery(`sum(node_memory_MemTotal_bytes{instance=~"${fqdn}"})`),
				client.instantQuery(
					`sum(node_memory_MemTotal_bytes{instance=~"${fqdn}"}) - sum(node_memory_MemAvailable_bytes{instance=~"${fqdn}"})`
				),
				client.instantQuery(`sum(node_memory_MemTotal_bytes{instance=~"${fqdn}"})`)
			]);
			overallVal = overallRes.result[0]?.value?.value ?? null;
			usingVal = usingRes.result[0]?.value?.value ?? null;
			totalVal = totalRes.result[0]?.value?.value ?? null;
		} catch {
			hasError = true;
		}
		isLoading = false;
	});
</script>

<Statistics.Root type="ratio">
	<Statistics.Header>
		<div class="flex justify-between gap-4">
			<Statistics.Title>{m.ram()}</Statistics.Title>
			{#if overallVal !== null}
				{@const { value, unit } = formatCapacity(overallVal)}
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
		{:else if hasError || usingVal === null || totalVal === null}
			<div class="flex h-[200px] w-full flex-col items-center justify-center">
				<ChartBar class="size-24 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else}
			{@const chartConfig = { data: { color: 'var(--chart-3)' } } satisfies Chart.ChartConfig}
			{@const value = usingVal / totalVal}
			{@const data = [{ value: value }]}
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
						{@const percentage = formatPercentage(usingVal as number, totalVal as number, 1)}
						{@const { value: usingValue, unit: usingUnit } = formatCapacity(usingVal as number)}
						{@const { value: totalValue, unit: totalUnit } = formatCapacity(totalVal as number)}
						<Text
							value={`${percentage} %`}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-3xl! font-bold"
							dy={-15}
						/>
						<Text
							value={`${usingValue} ${usingUnit}/${totalValue} ${totalUnit}`}
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

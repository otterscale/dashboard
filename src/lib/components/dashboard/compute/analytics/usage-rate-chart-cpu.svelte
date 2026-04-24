<script lang="ts">
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { ArcChart, Text } from 'layerchart';
	import { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatPercentage } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';

	let { client, vmName }: { client: PrometheusDriver; vmName: string } = $props();

	let vcpuCount = $state<number | null>(null);
	let usingVal = $state<number | null>(null);
	let totalVal = $state<number | null>(null);
	let isLoading = $state(true);
	let hasError = $state(false);

	onMount(async () => {
		try {
			const [usingRes, totalRes] = await Promise.all([
				client.instantQuery(
					`sum(rate(kubevirt_vmi_cpu_usage_seconds_total{name=~"${vmName}"}[5m]))`
				),
				client.instantQuery(`count(kubevirt_vmi_vcpu_seconds_total{name=~"${vmName}"})`)
			]);
			usingVal = usingRes.result[0]?.value?.value ?? null;
			totalVal = totalRes.result[0]?.value?.value ?? null;
			vcpuCount = totalVal !== null ? Math.round(totalVal) : null;
		} catch {
			hasError = true;
		}
		isLoading = false;
	});
</script>

<Statistics.Root type="ratio">
	<Statistics.Header>
		<div class="flex justify-between gap-4">
			<Statistics.Title>{m.cpu()}</Statistics.Title>
			{#if vcpuCount !== null}
				<div class="flex items-center gap-1 text-xl">
					<p class="font-bold">{vcpuCount} {m.vcpu()}</p>
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
			{@const value = totalVal > 0 ? usingVal / totalVal : 0}
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
						{@const percentage = formatPercentage(usingVal as number, totalVal as number, 1) ?? '—'}
						<Text
							value={`${percentage} %`}
							textAnchor="middle"
							verticalAnchor="middle"
							class="fill-foreground text-4xl! font-bold"
						/>
					{/snippet}
				</ArcChart>
			</Chart.Container>
		{/if}
	</Statistics.Content>
</Statistics.Root>

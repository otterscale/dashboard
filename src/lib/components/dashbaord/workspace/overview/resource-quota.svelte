<script lang="ts">
	import { ChartBar, Gauge, LoaderCircle } from '@lucide/svelte';
	import { ArcChart, Text } from 'layerchart';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import * as Chart from '$lib/components/ui/chart/index.js';
	import { formatCapacity, formatPercentage } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		isReloading: boolean;
	} = $props();

	let cpuUsed = $state<number | null>(null);
	let cpuHard = $state<number | null>(null);
	let memUsed = $state<number | null>(null);
	let memHard = $state<number | null>(null);
	let gpuUsed = $state<number | null>(null);
	let gpuHard = $state<number | null>(null);
	let gpuMemUsed = $state<number | null>(null);
	let gpuMemHard = $state<number | null>(null);
	let hasError = $state(false);

	function instantScalar(r: Awaited<ReturnType<PrometheusDriver['instantQuery']>>): number | null {
		const raw = r.result[0]?.value;
		const n =
			raw != null && typeof raw === 'object' && 'value' in raw
				? Number((raw as { value: number }).value)
				: Number(raw);
		return Number.isFinite(n) ? n : null;
	}

	async function fetchQuota() {
		const ns = escapePromqlStringLiteral(namespace);
		const base = `kube_resourcequota{namespace="${ns}"`;

		const [cpuU, cpuH, memU, memH, gpuU, gpuH, gpuMemU, gpuMemH] = await Promise.all([
			prometheusDriver.instantQuery(`sum(${base}, type="used", resource="requests.cpu"})`),
			prometheusDriver.instantQuery(`sum(${base}, type="hard", resource="requests.cpu"})`),
			prometheusDriver.instantQuery(`sum(${base}, type="used", resource="requests.memory"})`),
			prometheusDriver.instantQuery(`sum(${base}, type="hard", resource="requests.memory"})`),
			prometheusDriver.instantQuery(
				`sum(${base}, type="used", resource="requests.nvidia.com/gpu"})`
			),
			prometheusDriver.instantQuery(
				`sum(${base}, type="hard", resource="requests.nvidia.com/gpu"})`
			),
			prometheusDriver.instantQuery(
				`sum(${base}, type="used", resource="requests.nvidia.com/gpumem"})`
			),
			prometheusDriver.instantQuery(
				`sum(${base}, type="hard", resource="requests.nvidia.com/gpumem"})`
			)
		]);

		cpuUsed = instantScalar(cpuU);
		cpuHard = instantScalar(cpuH);
		memUsed = instantScalar(memU);
		memHard = instantScalar(memH);
		gpuUsed = instantScalar(gpuU) ?? 0;
		gpuHard = instantScalar(gpuH) ?? 0;
		gpuMemUsed = instantScalar(gpuMemU) ?? 0;
		gpuMemHard = instantScalar(gpuMemH) ?? 0;
	}

	async function fetch() {
		try {
			hasError = false;
			if (!namespace) return;
			await fetchQuota();
		} catch (error) {
			hasError = true;
			cpuUsed = cpuHard = memUsed = memHard = gpuUsed = gpuHard = gpuMemUsed = gpuMemHard = null;
			console.error('Failed to fetch workspace resource quota:', error);
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

	function formatCpuCores(n: number): string {
		return Number.isInteger(n) ? String(n) : n.toFixed(2);
	}
</script>

<Card.Root class="group relative h-full min-h-[160px] gap-2 overflow-hidden">
	<Gauge
		class="absolute -right-8 bottom-0 size-32 text-7xl tracking-tight text-nowrap text-primary/[0.06] transition-opacity group-hover:text-primary/[0.09] md:size-40"
		aria-hidden="true"
	/>
	<Card.Header>
		<Card.Title>{m.workspace_quota_usage_title()}</Card.Title>
		<Card.Description class="text-md flex min-h-6 items-center">
			{m.workspace_quota_usage_description()}
		</Card.Description>
	</Card.Header>
	{#if !namespace}
		<Card.Content class="text-sm text-muted-foreground"
			>{m.workspace_namespace_unresolved()}</Card.Content
		>
	{:else if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<LoaderCircle class="size-10 animate-spin text-muted-foreground" />
		</div>
	{:else}
		<Card.Content class="grid gap-4 md:grid-cols-2">
			<!-- CPU: same pattern as cluster analytics usage-rate-chart-cpu -->
			<Statistics.Root type="ratio" class="border-0 bg-transparent p-0 shadow-none">
				<Statistics.Header>
					<div class="flex justify-between gap-4">
						<Statistics.Title>{m.cpu()}</Statistics.Title>
						{#if cpuHard !== null}
							<div class="flex items-center gap-1 text-xl">
								<p class="font-bold">{formatCpuCores(cpuHard)} {m.cpu()}</p>
							</div>
						{/if}
					</div>
				</Statistics.Header>
				<Statistics.Content class="min-h-20">
					{#if hasError || cpuUsed === null || cpuHard === null || cpuHard === 0 || formatPercentage(cpuUsed, cpuHard, 1) === null}
						<div class="flex h-[168px] w-full flex-col items-center justify-center">
							<ChartBar class="size-16 animate-pulse text-muted-foreground" />
							<p class="text-sm text-muted-foreground">{m.no_data_display()}</p>
						</div>
					{:else}
						{@const chartConfig = { data: { color: 'var(--chart-3)' } } satisfies Chart.ChartConfig}
						{@const ratio = cpuUsed / cpuHard}
						{@const data = [{ value: ratio }]}
						<Chart.Container
							config={chartConfig}
							class="mx-auto my-auto aspect-square h-[168px] w-full max-w-[220px]"
						>
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
									{@const percentage = formatPercentage(cpuUsed!, cpuHard!, 1)}
									<Text
										value={`${percentage} %`}
										textAnchor="middle"
										verticalAnchor="middle"
										class="fill-foreground text-3xl! font-bold"
										dy={-12}
									/>
									<Text
										value={`${formatCpuCores(cpuUsed!)} / ${formatCpuCores(cpuHard!)}`}
										textAnchor="middle"
										verticalAnchor="middle"
										class="text-md! font-normal text-muted-foreground"
										dy={14}
									/>
								{/snippet}
							</ArcChart>
						</Chart.Container>
					{/if}
				</Statistics.Content>
			</Statistics.Root>

			<!-- Memory: same pattern as cluster analytics usage-rate-chart-ram -->
			<Statistics.Root type="ratio" class="border-0 bg-transparent p-0 shadow-none">
				<Statistics.Header>
					<div class="flex justify-between gap-4">
						<Statistics.Title>{m.ram()}</Statistics.Title>
						{#if memHard !== null}
							{@const { value, unit } = formatCapacity(memHard)}
							<div class="flex items-center gap-1 text-xl">
								<p class="font-bold">{value} {unit}</p>
							</div>
						{/if}
					</div>
				</Statistics.Header>
				<Statistics.Content class="min-h-20">
					{#if hasError || memUsed === null || memHard === null || memHard === 0 || formatPercentage(memUsed, memHard, 1) === null}
						<div class="flex h-[168px] w-full flex-col items-center justify-center">
							<ChartBar class="size-16 animate-pulse text-muted-foreground" />
							<p class="text-sm text-muted-foreground">{m.no_data_display()}</p>
						</div>
					{:else}
						{@const chartConfig = { data: { color: 'var(--chart-3)' } } satisfies Chart.ChartConfig}
						{@const ratio = memUsed / memHard}
						{@const data = [{ value: ratio }]}
						<Chart.Container
							config={chartConfig}
							class="mx-auto my-auto aspect-square h-[168px] w-full max-w-[220px]"
						>
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
									{@const percentage = formatPercentage(memUsed!, memHard!, 1)}
									{@const { value: usingValue, unit: usingUnit } = formatCapacity(memUsed!)}
									{@const { value: totalValue, unit: totalUnit } = formatCapacity(memHard!)}
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
										class="text-md! text-muted-foreground"
										dy={15}
									/>
								{/snippet}
							</ArcChart>
						</Chart.Container>
					{/if}
				</Statistics.Content>
			</Statistics.Root>

			<!-- GPU: nvidia.com/gpu -->
			<Statistics.Root type="ratio" class="border-0 bg-transparent p-0 shadow-none">
				<Statistics.Header>
					<div class="flex justify-between gap-4">
						<Statistics.Title>GPU</Statistics.Title>
						{#if gpuHard !== null}
							<div class="flex items-center gap-1 text-xl">
								<p class="font-bold">{gpuHard}</p>
							</div>
						{/if}
					</div>
				</Statistics.Header>
				<Statistics.Content class="min-h-20">
					{#if hasError || gpuUsed === null || gpuHard === null}
						<div class="flex h-[168px] w-full flex-col items-center justify-center">
							<ChartBar class="size-16 animate-pulse text-muted-foreground" />
							<p class="text-sm text-muted-foreground">{m.no_data_display()}</p>
						</div>
					{:else if gpuHard === 0}
						{@const chartConfig = { data: { color: 'var(--chart-3)' } } satisfies Chart.ChartConfig}
						{@const data = [{ value: 0 }]}
						<Chart.Container
							config={chartConfig}
							class="mx-auto my-auto aspect-square h-[168px] w-full max-w-[220px]"
						>
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
									<Text
										value="0 / 0"
										textAnchor="middle"
										verticalAnchor="middle"
										class="fill-foreground text-3xl! font-bold"
										dy={0}
									/>
								{/snippet}
							</ArcChart>
						</Chart.Container>
					{:else}
						{@const chartConfig = { data: { color: 'var(--chart-3)' } } satisfies Chart.ChartConfig}
						{@const ratio = gpuUsed / gpuHard}
						{@const data = [{ value: ratio }]}
						<Chart.Container
							config={chartConfig}
							class="mx-auto my-auto aspect-square h-[168px] w-full max-w-[220px]"
						>
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
									{@const percentage = formatPercentage(gpuUsed!, gpuHard!, 1)}
									<Text
										value={`${percentage} %`}
										textAnchor="middle"
										verticalAnchor="middle"
										class="fill-foreground text-3xl! font-bold"
										dy={-12}
									/>
									<Text
										value={`${gpuUsed!} / ${gpuHard!}`}
										textAnchor="middle"
										verticalAnchor="middle"
										class="text-md! font-normal text-muted-foreground"
										dy={14}
									/>
								{/snippet}
							</ArcChart>
						</Chart.Container>
					{/if}
				</Statistics.Content>
			</Statistics.Root>

			<!-- GPU Memory: nvidia.com/gpumem -->
			<Statistics.Root type="ratio" class="border-0 bg-transparent p-0 shadow-none">
				<Statistics.Header>
					<div class="flex justify-between gap-4">
						<Statistics.Title>GPU Memory</Statistics.Title>
						{#if gpuMemHard !== null}
							{@const { value, unit } = formatCapacity(gpuMemHard)}
							<div class="flex items-center gap-1 text-xl">
								<p class="font-bold">{value} {unit}</p>
							</div>
						{/if}
					</div>
				</Statistics.Header>
				<Statistics.Content class="min-h-20">
					{#if hasError || gpuMemUsed === null || gpuMemHard === null}
						<div class="flex h-[168px] w-full flex-col items-center justify-center">
							<ChartBar class="size-16 animate-pulse text-muted-foreground" />
							<p class="text-sm text-muted-foreground">{m.no_data_display()}</p>
						</div>
					{:else if gpuMemHard === 0}
						{@const chartConfig = { data: { color: 'var(--chart-3)' } } satisfies Chart.ChartConfig}
						{@const data = [{ value: 0 }]}
						<Chart.Container
							config={chartConfig}
							class="mx-auto my-auto aspect-square h-[168px] w-full max-w-[220px]"
						>
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
									<Text
										value="0 / 0"
										textAnchor="middle"
										verticalAnchor="middle"
										class="fill-foreground text-3xl! font-bold"
										dy={0}
									/>
								{/snippet}
							</ArcChart>
						</Chart.Container>
					{:else}
						{@const chartConfig = { data: { color: 'var(--chart-3)' } } satisfies Chart.ChartConfig}
						{@const ratio = gpuMemUsed / gpuMemHard}
						{@const data = [{ value: ratio }]}
						<Chart.Container
							config={chartConfig}
							class="mx-auto my-auto aspect-square h-[168px] w-full max-w-[220px]"
						>
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
									{@const percentage = formatPercentage(gpuMemUsed!, gpuMemHard!, 1)}
									{@const { value: usingValue, unit: usingUnit } = formatCapacity(gpuMemUsed!)}
									{@const { value: totalValue, unit: totalUnit } = formatCapacity(gpuMemHard!)}
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
										class="text-md! text-muted-foreground"
										dy={15}
									/>
								{/snippet}
							</ArcChart>
						</Chart.Container>
					{/if}
				</Statistics.Content>
			</Statistics.Root>
		</Card.Content>
	{/if}
</Card.Root>

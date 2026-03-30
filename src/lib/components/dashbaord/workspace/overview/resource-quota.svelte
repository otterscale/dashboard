<script lang="ts">
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import Gauge from '@lucide/svelte/icons/gauge';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { ArcChart, Text } from 'layerchart';
	import { ResponseType, type PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import * as Statistics from '$lib/components/custom/data-table/statistics/index';
	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Button } from '$lib/components/ui/button/index.js';
	import * as ButtonGroup from '$lib/components/ui/button-group/index.js';
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
		namespace: string;
		isReloading: boolean;
	} = $props();

	/** Which ResourceQuota resource keys to visualize (requests.* vs limits.*). */
	let quotaView = $state<'requests' | 'limits'>('requests');

	let cpuUsedReq = $state<number | null>(null);
	let cpuHardReq = $state<number | null>(null);
	let cpuUsedLim = $state<number | null>(null);
	let cpuHardLim = $state<number | null>(null);
	let memUsedReq = $state<number | null>(null);
	let memHardReq = $state<number | null>(null);
	let memUsedLim = $state<number | null>(null);
	let memHardLim = $state<number | null>(null);
	/** GPU / GPU memory: quotas are usually requests-only; not tied to the requests/limits toggle. */
	let gpuUsed = $state<number | null>(null);
	let gpuHard = $state<number | null>(null);
	let gpuMemUsed = $state<number | null>(null);
	let gpuMemHard = $state<number | null>(null);
	let hasError = $state(false);

	const cpuUsed = $derived(quotaView === 'requests' ? cpuUsedReq : cpuUsedLim);
	const cpuHard = $derived(quotaView === 'requests' ? cpuHardReq : cpuHardLim);
	const memUsed = $derived(quotaView === 'requests' ? memUsedReq : memUsedLim);
	const memHard = $derived(quotaView === 'requests' ? memHardReq : memHardLim);

	function finiteOrNull(v: unknown): number | null {
		const n = Number(v);
		return Number.isFinite(n) ? n : null;
	}

	function extractValue(raw: unknown): unknown {
		if (Array.isArray(raw) && raw.length >= 2) return raw[1];
		if (typeof raw === 'object' && raw !== null && 'value' in raw) return (raw as Record<string, unknown>).value;
		return raw;
	}

	function instantScalar(r: Awaited<ReturnType<PrometheusDriver['instantQuery']>>): number | null {
		const res = r.result;
		if (!Array.isArray(res) || res.length === 0) return null;

		if (r.resultType === ResponseType.SCALAR || r.resultType === ResponseType.STRING) {
			return finiteOrNull(res[1]);
		}

		const raw = (res[0] as { value?: unknown })?.value;
		return raw == null ? null : finiteOrNull(extractValue(raw));
	}

	function rqSum(resource: string, t: 'used' | 'hard') {
		const ns = escapePromqlStringLiteral(namespace);
		const base = `kube_resourcequota{namespace="${ns}"`;
		return `sum(${base}, type="${t}", resource="${resource}"})`;
	}

	/** KSM `resource` label on `kube_pod_container_resource_limits` (dots → underscores). */
	const KSM_POD_RES_NVIDIA_GPU = 'nvidia_com_gpu';
	const KSM_POD_RES_NVIDIA_GPUMEM = 'nvidia_com_gpumem';

	/** Sum limits for ready containers only (matches workspace viewer pod usage). */
	function podContainerReadyLimitSum(ns: string, ksmResourceLabel: string): string {
		const nsLit = escapePromqlStringLiteral(ns);
		const resLit = escapePromqlStringLiteral(ksmResourceLabel);
		return `sum(kube_pod_container_resource_limits{namespace="${nsLit}",resource="${resLit}"} and on (namespace, pod, container) kube_pod_container_status_ready{namespace="${nsLit}"} == 1)`;
	}

	async function queryScalar(q: string): Promise<number | null> {
		try {
			const r = await prometheusDriver.instantQuery(q, new Date());
			return instantScalar(r);
		} catch {
			return null;
		}
	}

	async function fetchQuota() {
		const [
			cpuReqU,
			cpuReqH,
			cpuLimU,
			cpuLimH,
			memReqU,
			memReqH,
			memLimU,
			memLimH,
			gpuUsedFromPods,
			gpuHardFromRq,
			gpuMemUsedFromPods,
			gpuMemHardFromRq
		] = await Promise.all([
			queryScalar(rqSum('requests.cpu', 'used')),
			queryScalar(rqSum('requests.cpu', 'hard')),
			queryScalar(rqSum('limits.cpu', 'used')),
			queryScalar(rqSum('limits.cpu', 'hard')),
			queryScalar(rqSum('requests.memory', 'used')),
			queryScalar(rqSum('requests.memory', 'hard')),
			queryScalar(rqSum('limits.memory', 'used')),
			queryScalar(rqSum('limits.memory', 'hard')),
			queryScalar(podContainerReadyLimitSum(namespace, KSM_POD_RES_NVIDIA_GPU)),
			queryScalar(rqSum('nvidia.com/gpu', 'hard')),
			queryScalar(podContainerReadyLimitSum(namespace, KSM_POD_RES_NVIDIA_GPUMEM)),
			queryScalar(rqSum('nvidia.com/gpumem', 'hard'))
		]);

		cpuUsedReq = cpuReqU;
		cpuHardReq = cpuReqH;
		cpuUsedLim = cpuLimU;
		cpuHardLim = cpuLimH;
		memUsedReq = memReqU;
		memHardReq = memReqH;
		memUsedLim = memLimU;
		memHardLim = memLimH;
		gpuUsed = gpuUsedFromPods ?? 0;
		gpuHard = gpuHardFromRq ?? 0;
		gpuMemUsed = gpuMemUsedFromPods ?? 0;
		gpuMemHard = gpuMemHardFromRq ?? 0;
	}

	function resetQuotaState() {
		cpuUsedReq = cpuHardReq = cpuUsedLim = cpuHardLim = null;
		memUsedReq = memHardReq = memUsedLim = memHardLim = null;
		gpuUsed = gpuHard = gpuMemUsed = gpuMemHard = null;
	}

	async function fetch() {
		try {
			hasError = false;
			if (!namespace) return;
			await fetchQuota();
		} catch (error) {
			hasError = true;
			resetQuotaState();
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

	/** `nvidia.com/gpumem` values are in MB; display converts to GB (1024 MB = 1 GB). */
	function formatGpuMemGb(nMb: number): { value: string; unit: string } {
		const gb = nMb / 1024;
		return {
			value: gb.toLocaleString('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 0 }),
			unit: 'GB'
		};
	}
</script>

<Card.Root class="group relative h-full min-h-[160px] gap-2 overflow-hidden">
	<Gauge
		class="absolute -right-8 bottom-0 size-32 text-7xl tracking-tight text-nowrap text-primary/[0.06] transition-opacity group-hover:text-primary/[0.09] md:size-40"
		aria-hidden="true"
	/>
	<Card.Header class="space-y-3">
		<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
			<div class="min-w-0 flex-1 space-y-1.5">
				<Card.Title>{m.workspace_quota_usage_title()}</Card.Title>
				<Card.Description class="text-md flex min-h-6 items-center">
					{m.workspace_quota_usage_description()}
				</Card.Description>
			</div>
			<ButtonGroup.Root
				class="shrink-0 self-stretch sm:self-auto"
				aria-label={m.workspace_quota_toggle_aria()}
			>
				<Button
					type="button"
					size="sm"
					variant={quotaView === 'requests' ? 'secondary' : 'outline'}
					class="min-w-[5.5rem]"
					onclick={() => (quotaView = 'requests')}
				>
					{m.workspace_quota_toggle_requests()}
				</Button>
				<Button
					type="button"
					size="sm"
					variant={quotaView === 'limits' ? 'secondary' : 'outline'}
					class="min-w-[5.5rem]"
					onclick={() => (quotaView = 'limits')}
				>
					{m.workspace_quota_toggle_limits()}
				</Button>
			</ButtonGroup.Root>
		</div>
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
							{@const { value, unit } = formatGpuMemGb(gpuMemHard)}
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
									{@const { value: usingValue, unit: usingUnit } = formatGpuMemGb(gpuMemUsed!)}
									{@const { value: totalValue, unit: totalUnit } = formatGpuMemGb(gpuMemHard!)}
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

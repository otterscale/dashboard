<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import { page } from '$app/state';
	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Statistics from '$lib/components/custom/statistics/index';
	import { formatWithBinarySuffix } from '$lib/components/dynamic-table/utils';
	import { buttonVariants } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { classifyThreshold, fetchCombinedInstant, thresholdClasses } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	let {
		prometheusDriver,
		isReloading = $bindable()
	}: { prometheusDriver: PrometheusDriver; isReloading: boolean } = $props();

	const transport = getContext<Transport>('transport');
	const resourceClient = createClient(ResourceService, transport);

	// namespace → workspace name (Workspace CRD owns one namespace via `spec.namespace`).
	let namespaceToWorkspace = $state<Record<string, string>>({});

	async function fetchWorkspaceMap() {
		try {
			const response = await resourceClient.list({
				cluster: page.params.cluster ?? '',
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				namespace: ''
			});
			const map: Record<string, string> = {};
			for (const item of response.items) {
				const obj = item.object as Record<string, unknown> | undefined;
				const meta = obj?.metadata as Record<string, unknown> | undefined;
				const spec = obj?.spec as Record<string, unknown> | undefined;
				const name = meta?.name;
				const ns = spec?.namespace;
				if (typeof name === 'string' && typeof ns === 'string' && name && ns) {
					map[ns] = name;
				}
			}
			namespaceToWorkspace = map;
		} catch (error) {
			console.error('Failed to list workspaces:', error);
		}
	}

	// A workload (from the vGPU usage series' `podnamespace`/`podname`) sharing a GPU.
	type GpuConsumer = { namespace: string; pod: string; usage?: number };

	// One physical GPU: `total` from DCGM, `usage`/`limit` from the vGPU exporter (undefined
	// without the vGPU stack), joined by device UUID.
	type GpuDevice = {
		uuid: string;
		modelName: string;
		device: string;
		usage?: number;
		limit?: number;
		total?: number;
		// Workloads (namespace/pod) attributed to this device via the vGPU usage series.
		consumers: GpuConsumer[];
	};

	type NodeRow = {
		node: string;
		cpuUse: number;
		cpuReq: number;
		cpuLim: number;
		memUse: number;
		memReq: number;
		memLim: number;
		// Per-node GPU rollup (sum across `gpus`, bytes); undefined when not reported.
		gpuUsage?: number;
		gpuLimit?: number;
		gpuTotal?: number;
		// Same rollup as % of physical capacity (`total`), comparable with the CPU/Mem columns.
		gpuUsePct?: number;
		gpuLimPct?: number;
		gpus: GpuDevice[];
	};

	// All ratios share the per-node allocatable base, so Usage/Request/Limit are comparable;
	// Request/Limit ≥ 100% means the node can't schedule new pods even if Usage is low.
	const ALLOC_CPU = 'sum(kube_node_status_allocatable{resource="cpu", unit="core"}) by (node)';
	const ALLOC_MEM = 'sum(kube_node_status_allocatable{resource="memory", unit="byte"}) by (node)';
	const queries = {
		cpuUse: `100 * sum(irate(container_cpu_usage_seconds_total{container!=""}[2m])) by (node) / ${ALLOC_CPU}`,
		cpuReq: `100 * sum(kube_pod_container_resource_requests{resource="cpu", unit="core"}) by (node) / ${ALLOC_CPU}`,
		cpuLim: `100 * sum(kube_pod_container_resource_limits{resource="cpu", unit="core"}) by (node) / ${ALLOC_CPU}`,
		memUse: `100 * sum(container_memory_working_set_bytes{container!=""}) by (node) / ${ALLOC_MEM}`,
		memReq: `100 * sum(kube_pod_container_resource_requests{resource="memory", unit="byte"}) by (node) / ${ALLOC_MEM}`,
		memLim: `100 * sum(kube_pod_container_resource_limits{resource="memory", unit="byte"}) by (node) / ${ALLOC_MEM}`
	};

	// Numeric percentage fields filled from the combined pressure query (keyed by query name).
	type PressureKey = 'cpuUse' | 'cpuReq' | 'cpuLim' | 'memUse' | 'memReq' | 'memLim';

	const GPU_QUERIES = {
		// Physical frame buffer per GPU → bytes (DCGM reports MiB). Labelled Hostname/UUID/modelName/device.
		total: '(DCGM_FI_DEV_FB_FREE + DCGM_FI_DEV_FB_RESERVED + DCGM_FI_DEV_FB_USED) * (1024 * 1024)',
		limit: 'sum by (deviceuuid) (vGPU_device_memory_limit_in_bytes)',
		// Unaggregated so each series keeps `podnamespace`/`podname`; per-device sum is done in JS.
		usage: 'vGPU_device_memory_usage_in_bytes'
	};

	let rows = $state<NodeRow[]>([]);
	let isLoaded = $state(false);

	// Sum a GPU field across a node's devices; undefined when none report it (cell renders "—").
	function sumGpuField(gpus: GpuDevice[], key: 'usage' | 'limit' | 'total'): number | undefined {
		let sum = 0;
		let seen = false;
		for (const gpu of gpus) {
			const value = gpu[key];
			if (typeof value === 'number' && Number.isFinite(value)) {
				sum += value;
				seen = true;
			}
		}
		return seen ? sum : undefined;
	}

	// `numerator / denominator` as a percentage, or undefined when either is missing/zero.
	function ratioPct(numerator?: number, denominator?: number): number | undefined {
		if (
			numerator === undefined ||
			denominator === undefined ||
			!Number.isFinite(numerator) ||
			!Number.isFinite(denominator) ||
			denominator === 0
		) {
			return undefined;
		}
		return (numerator / denominator) * 100;
	}

	// Fetch GPU devices, grouped by node name (DCGM's `Hostname` label == the K8s node name).
	async function fetchGpusByNode(): Promise<Record<string, GpuDevice[]>> {
		try {
			const [totalResponse, limitResponse, usageResponse] = await Promise.all([
				prometheusDriver.instantQuery(GPU_QUERIES.total),
				prometheusDriver.instantQuery(GPU_QUERIES.limit),
				prometheusDriver.instantQuery(GPU_QUERIES.usage)
			]);

			const numberByDeviceUuid = (vectors: typeof limitResponse.result): Record<string, number> => {
				const out: Record<string, number> = {};
				for (const series of vectors) {
					const uuid = (series.metric.labels as Record<string, string>).deviceuuid;
					const value = Number(series.value?.value);
					if (uuid && Number.isFinite(value)) out[uuid] = value;
				}
				return out;
			};
			const limitByUuid = numberByDeviceUuid(limitResponse.result);

			// Fold raw usage into a per-device total + deduped consumers (same ns/pod summed).
			const usageByUuid: Record<string, number> = {};
			const consumersByUuid: Record<string, Record<string, GpuConsumer>> = {};
			for (const series of usageResponse.result) {
				const labels = series.metric.labels as Record<string, string>;
				const uuid = labels.deviceuuid;
				if (!uuid) continue;
				const value = Number(series.value?.value);
				const usage = Number.isFinite(value) ? value : undefined;
				if (usage !== undefined) usageByUuid[uuid] = (usageByUuid[uuid] ?? 0) + usage;
				const namespace = labels.podnamespace ?? '';
				const pod = labels.podname ?? '';
				if (!namespace && !pod) continue;
				const byKey = (consumersByUuid[uuid] ??= {});
				const key = `${namespace}/${pod}`;
				const existing = byKey[key];
				if (existing) {
					if (usage !== undefined) existing.usage = (existing.usage ?? 0) + usage;
				} else {
					byKey[key] = { namespace, pod, usage };
				}
			}

			const byNode: Record<string, GpuDevice[]> = {};
			for (const series of totalResponse.result) {
				const labels = series.metric.labels as Record<string, string>;
				const host = labels.Hostname;
				if (!host) continue;
				const uuid = labels.UUID ?? '';
				const total = Number(series.value?.value);
				(byNode[host] ??= []).push({
					uuid,
					modelName: labels.modelName ?? '',
					device: labels.device ?? '',
					total: Number.isFinite(total) ? total : undefined,
					limit: limitByUuid[uuid],
					usage: usageByUuid[uuid],
					consumers: Object.values(consumersByUuid[uuid] ?? {})
				});
			}
			return byNode;
		} catch (error) {
			console.error('Failed to fetch GPU resources:', error);
			return {};
		}
	}

	async function fetch() {
		try {
			const [result, gpusByNode] = await Promise.all([
				fetchCombinedInstant(prometheusDriver, queries),
				fetchGpusByNode()
			]);
			const byNode: Record<string, NodeRow> = {};
			const ensure = (node: string): NodeRow =>
				(byNode[node] ??= {
					node,
					cpuUse: 0,
					cpuReq: 0,
					cpuLim: 0,
					memUse: 0,
					memReq: 0,
					memLim: 0,
					gpus: []
				});
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const node = (v.metric.labels as Record<string, string>).node;
					if (!node) continue;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					ensure(node)[key as PressureKey] = value;
				}
			}
			// Seed rows from GPU hosts too (a node may have GPUs but no pressure series).
			for (const node of Object.keys(gpusByNode)) ensure(node);
			for (const row of Object.values(byNode)) {
				row.gpus = gpusByNode[row.node] ?? [];
				row.gpuUsage = sumGpuField(row.gpus, 'usage');
				row.gpuLimit = sumGpuField(row.gpus, 'limit');
				row.gpuTotal = sumGpuField(row.gpus, 'total');
				row.gpuUsePct = ratioPct(row.gpuUsage, row.gpuTotal);
				row.gpuLimPct = ratioPct(row.gpuLimit, row.gpuTotal);
			}
			rows = Object.values(byNode).sort((a, b) => pressure(b) - pressure(a));
		} catch (error) {
			console.error('Failed to fetch node pressure:', error);
		}
	}

	// Worst reservation pressure on a node (CPU/Mem/GPU limit) — what blocks scheduling.
	function pressure(row: NodeRow): number {
		return Math.max(row.cpuReq, row.cpuLim, row.memReq, row.memLim, row.gpuLimPct ?? 0);
	}

	function pctClass(value: number): string {
		return thresholdClasses(classifyThreshold(value, { green: 70, orange: 90 })).text;
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	onMount(async () => {
		await Promise.all([fetch(), fetchWorkspaceMap()]);
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	const columns: { key: PressureKey; label: string }[] = [
		{ key: 'cpuUse', label: 'CPU Usage' },
		{ key: 'cpuReq', label: 'CPU Request' },
		{ key: 'cpuLim', label: 'CPU Limit' },
		{ key: 'memUse', label: 'Mem Usage' },
		{ key: 'memReq', label: 'Mem Request' },
		{ key: 'memLim', label: 'Mem Limit' }
	];

	// GPU columns/rows only render when at least one node reports a GPU.
	const hasGpu = $derived(rows.some((row) => row.gpus.length > 0));

	// Node rows expanded to show per-GPU-card details.
	const expandedNodes = new SvelteSet<string>();
	function toggleNode(node: string) {
		if (expandedNodes.has(node)) expandedNodes.delete(node);
		else expandedNodes.add(node);
	}

	// Workspace owning a namespace; falls back to the raw namespace when unmapped.
	function workspaceOf(namespace: string): string {
		return namespaceToWorkspace[namespace] || namespace || '—';
	}

	// Grow the card's scroll viewport while any node is expanded (detail rows need the room).
	const anyExpanded = $derived(expandedNodes.size > 0);

	// Format a byte count as "12.34 Gi" (`digits` decimals); "—" when not reported.
	function formatGpuBytes(value: number | undefined, digits = 2): string {
		if (value === undefined || !Number.isFinite(value)) return '—';
		const { value: scaled, unit } = formatWithBinarySuffix(BigInt(Math.round(value)));
		return `${scaled.toFixed(digits)} ${unit}`.trim();
	}

	// Beyond this many rows the table moves into a fixed-height ScrollArea instead of growing.
	const SCROLL_AFTER = 5;
</script>

{#snippet table(detailed: boolean)}
	{@const showGpu = detailed && hasGpu}
	{@const colSpan = 1 + columns.length + (showGpu ? 2 : 0)}
	<div class="overflow-x-auto">
		<Table.Root>
			<Table.Header>
				<Table.Row>
					<Table.Head>{m.node()}</Table.Head>
					{#each columns as col (col.key)}
						<Table.Head class="text-right whitespace-nowrap">{col.label}</Table.Head>
					{/each}
					{#if showGpu}
						<Table.Head class="text-right whitespace-nowrap">GPU Usage</Table.Head>
						<Table.Head class="text-right whitespace-nowrap">GPU Limit</Table.Head>
					{/if}
				</Table.Row>
			</Table.Header>
			<Table.Body>
				{#each rows as row (row.node)}
					{@const saturated = pressure(row) >= 100}
					{@const expandable = showGpu && row.gpus.length > 0}
					{@const open = expandedNodes.has(row.node)}
					{@const gpuModel =
						[...new Set(row.gpus.map((gpu) => gpu.modelName).filter(Boolean))].join(', ') || 'GPU'}
					<Table.Row
						class={cn(saturated && 'bg-destructive/5', expandable && 'cursor-pointer')}
						onclick={expandable ? () => toggleNode(row.node) : undefined}
					>
						<Table.Cell class="font-medium" title={row.node}>
							{#if expandable}
								<div class="flex items-center gap-1.5 whitespace-nowrap">
									<ChevronRightIcon
										class={cn(
											'size-4 shrink-0 text-muted-foreground transition-transform',
											open && 'rotate-90'
										)}
									/>
									<span>{row.node}</span>
									<span class="text-xs text-muted-foreground">
										({row.gpus.length} × {gpuModel} · {formatGpuBytes(row.gpuTotal, 0)})
									</span>
								</div>
							{:else}
								{row.node}
							{/if}
						</Table.Cell>
						{#each columns as col (col.key)}
							<Table.Cell class={cn('text-right font-mono tabular-nums', pctClass(row[col.key]))}>
								{Math.round(row[col.key])}%
							</Table.Cell>
						{/each}
						{#if showGpu}
							<Table.Cell
								class={cn(
									'text-right font-mono tabular-nums',
									row.gpuUsePct !== undefined && pctClass(row.gpuUsePct)
								)}
							>
								{row.gpuUsePct !== undefined ? `${Math.round(row.gpuUsePct)}%` : '—'}
							</Table.Cell>
							<Table.Cell
								class={cn(
									'text-right font-mono tabular-nums',
									row.gpuLimPct !== undefined && pctClass(row.gpuLimPct)
								)}
							>
								{row.gpuLimPct !== undefined ? `${Math.round(row.gpuLimPct)}%` : '—'}
							</Table.Cell>
						{/if}
					</Table.Row>
					{#if expandable && open}
						<Table.Row class="hover:bg-transparent">
							<Table.Cell colspan={colSpan} class="bg-muted/30 p-3">
								<Table.Root>
									<Table.Header>
										<Table.Row class="hover:bg-transparent">
											<Table.Head>Model Name</Table.Head>
											<Table.Head>Device</Table.Head>
											<Table.Head>UUID</Table.Head>
											<Table.Head>Workspace</Table.Head>
											<Table.Head>Pod</Table.Head>
											<Table.Head class="text-right">Usage</Table.Head>
											<Table.Head class="text-right">Limit</Table.Head>
											<Table.Head class="text-right">Total</Table.Head>
										</Table.Row>
									</Table.Header>
									<Table.Body>
										{#each row.gpus as gpu, index (gpu.uuid || index)}
											<Table.Row class="border-none">
												<Table.Cell>{gpu.modelName || '—'}</Table.Cell>
												<Table.Cell>{gpu.device || '—'}</Table.Cell>
												<Table.Cell class="font-mono">{gpu.uuid || '—'}</Table.Cell>
												<Table.Cell>
													{#if gpu.consumers.length}
														<div class="flex flex-col gap-0.5">
															{#each gpu.consumers as consumer (consumer.namespace + '/' + consumer.pod)}
																<span class="whitespace-nowrap" title={consumer.namespace}>
																	{workspaceOf(consumer.namespace)}
																</span>
															{/each}
														</div>
													{:else}
														—
													{/if}
												</Table.Cell>
												<Table.Cell>
													{#if gpu.consumers.length}
														<div class="flex flex-col gap-0.5">
															{#each gpu.consumers as consumer (consumer.namespace + '/' + consumer.pod)}
																<span class="font-mono whitespace-nowrap"
																	>{consumer.pod || '—'}</span
																>
															{/each}
														</div>
													{:else}
														—
													{/if}
												</Table.Cell>
												<Table.Cell class="text-right font-mono tabular-nums">
													{formatGpuBytes(gpu.usage)}
												</Table.Cell>
												<Table.Cell class="text-right font-mono tabular-nums">
													{formatGpuBytes(gpu.limit)}
												</Table.Cell>
												<Table.Cell class="text-right font-mono tabular-nums">
													{formatGpuBytes(gpu.total)}
												</Table.Cell>
											</Table.Row>
										{/each}
									</Table.Body>
								</Table.Root>
							</Table.Cell>
						</Table.Row>
					{/if}
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
{/snippet}

<Statistics.Root type="count" class="overflow-visible">
	<Statistics.Header class="flex flex-row items-center gap-2 space-y-0">
		<div class="grid flex-1 gap-1">
			<Statistics.Title class="text-base leading-normal text-foreground">
				{m.node_resource_pressure()}
			</Statistics.Title>
			<p class="text-sm text-muted-foreground">
				{m.cluster_dashboard_node_pressure_description()}
			</p>
		</div>
		<Sheet.Root>
			<Sheet.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<Maximize2Icon class="size-5 text-muted-foreground" />
			</Sheet.Trigger>
			<Sheet.Content class="flex min-w-[77vw] flex-col gap-4 overflow-auto p-8">
				<Sheet.Header class="p-0">
					<Sheet.Title>{m.node_resource_pressure()}</Sheet.Title>
					<Sheet.Description>{m.cluster_dashboard_node_pressure_description()}</Sheet.Description>
				</Sheet.Header>
				{@render table(true)}
			</Sheet.Content>
		</Sheet.Root>
		<Tooltip.Root>
			<Tooltip.Trigger class={buttonVariants({ variant: 'ghost', size: 'icon' })}>
				<InfoIcon class="size-5 text-muted-foreground" />
			</Tooltip.Trigger>
			<Tooltip.Content class="max-w-xs">
				<p>{m.cluster_dashboard_node_pressure_tooltip()}</p>
			</Tooltip.Content>
		</Tooltip.Root>
	</Statistics.Header>
	<Statistics.Content class="min-h-16">
		{#if !isLoaded}
			<div class="flex h-50 w-full items-center justify-center">
				<LoaderCircle class="size-12 animate-spin" />
			</div>
		{:else if rows.length === 0}
			<div class="flex h-50 w-full flex-col items-center justify-center">
				<ChartColumnIcon class="size-12 animate-pulse text-muted-foreground" />
				<p class="text-base text-muted-foreground">{m.no_data_display()}</p>
			</div>
		{:else if rows.length > SCROLL_AFTER}
			<ScrollArea
				class={cn('w-full transition-[height] duration-200', anyExpanded ? 'h-[40rem]' : 'h-80')}
			>
				{@render table(true)}
			</ScrollArea>
		{:else}
			{@render table(true)}
		{/if}
	</Statistics.Content>
</Statistics.Root>

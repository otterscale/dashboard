<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ChartColumnIcon from '@lucide/svelte/icons/chart-column';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InfoIcon from '@lucide/svelte/icons/info';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { InstantVector, PrometheusDriver } from 'prometheus-query';
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
	import { formatIO } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		AI100_DEVICE_CLASS,
		ai100DiskRateByNode,
		classifyGpuGovernance,
		classifyThreshold,
		DCGM_GPU_MEMORY_TOTAL_BYTES,
		DCGM_GPU_MEMORY_USED_BYTES,
		deviceClassLabel,
		fetchCombinedInstant,
		type GpuGovernance,
		LIVE_PODS,
		thresholdClasses
	} from '$lib/prometheus';
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

	// A workload (from the vGPU allocation series' pod labels) holding part of a GPU.
	type GpuConsumer = { namespace: string; pod: string; allocated?: number };

	// One physical GPU. `allocated` is HAMi's booking (absent without the vGPU stack); everything
	// else is measured by DCGM. The two sides are joined by device UUID.
	type GpuDevice = {
		uuid: string;
		modelName: string;
		device: string;
		allocated?: number;
		used?: number;
		total?: number;
		util?: number;
		smClock?: number;
		temperature?: number;
		power?: number;
		// Fault counters that stay at zero for the life of a healthy card.
		remappedUncorrectable?: number;
		remapFailure?: number;
		pcieReplay?: number;
		// Workloads (namespace/pod) attributed to this device via the vGPU allocation series.
		consumers: GpuConsumer[];
		// Booking vs measurement on this card.
		governance: GpuGovernance;
	};

	// One TopoLVM volume group on a node. `used` is derived (size − available); TopoLVM
	// reports no used series of its own.
	type DiskPool = {
		used?: number;
		total?: number;
		// As % of pool capacity, comparable with the CPU/Mem/GPU columns.
		usePct?: number;
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
		gpuAllocated?: number;
		gpuUsed?: number;
		gpuTotal?: number;
		// Same rollup as % of physical capacity (`total`), comparable with the CPU/Mem columns.
		gpuAllocPct?: number;
		gpuUsedPct?: number;
		// Mean compute utilization across the node's cards.
		gpuUtil?: number;
		gpus: GpuDevice[];
		// TopoLVM pools on this node, keyed by device class (`aidaptiv` is the AI100 drive).
		// Empty on nodes TopoLVM doesn't manage.
		disks: Record<string, DiskPool>;
		// AI100 throughput, bytes/s. From node_exporter rather than TopoLVM, so it exists
		// independently of whether the volume group above is reported.
		diskWrite?: number;
		diskRead?: number;
	};

	// All ratios share the per-node allocatable base, so Usage/Request/Limit are comparable;
	// Request/Limit ≥ 100% means the node can't schedule new pods even if Usage is low.
	const ALLOC_CPU = 'sum(kube_node_status_allocatable{resource="cpu", unit="core"}) by (node)';
	const ALLOC_MEM = 'sum(kube_node_status_allocatable{resource="memory", unit="byte"}) by (node)';
	const queries = {
		cpuUse: `100 * sum(irate(container_cpu_usage_seconds_total{container!=""}[2m])) by (node) / ${ALLOC_CPU}`,
		cpuReq: `100 * sum by (node) (kube_pod_container_resource_requests{resource="cpu", unit="core"} ${LIVE_PODS}) / ${ALLOC_CPU}`,
		cpuLim: `100 * sum by (node) (kube_pod_container_resource_limits{resource="cpu", unit="core"} ${LIVE_PODS}) / ${ALLOC_CPU}`,
		memUse: `100 * sum(container_memory_working_set_bytes{container!=""}) by (node) / ${ALLOC_MEM}`,
		memReq: `100 * sum by (node) (kube_pod_container_resource_requests{resource="memory", unit="byte"} ${LIVE_PODS}) / ${ALLOC_MEM}`,
		memLim: `100 * sum by (node) (kube_pod_container_resource_limits{resource="memory", unit="byte"} ${LIVE_PODS}) / ${ALLOC_MEM}`,
		// TopoLVM's node exporter; `node` is a ConstLabel there, so these join the rows above
		// directly. Absent unless the phison-topolvm module sets
		// `topolvm.node.prometheus.podMonitor.enabled`. Bytes, since the ratio needs both.
		// Kept split by `device_class` so a second volume group can never be silently summed
		// into the AI100 pool — `lvmd.deviceClasses` is a list, today holding only `aidaptiv`.
		diskTotal: 'sum by (node, device_class) (topolvm_volumegroup_size_bytes)',
		diskUsed:
			'sum by (node, device_class) (topolvm_volumegroup_size_bytes) - sum by (node, device_class) (topolvm_volumegroup_available_bytes)',
		// Throughput is matched on the drive model, which only ever identifies an AI100 — the
		// node's system SSDs and Ceph RBDs must not be counted as offload traffic.
		diskWrite: ai100DiskRateByNode('node_disk_written_bytes_total'),
		diskRead: ai100DiskRateByNode('node_disk_read_bytes_total')
	};

	// Numeric percentage fields filled from the combined pressure query (keyed by query name).
	type PressureKey = 'cpuUse' | 'cpuReq' | 'cpuLim' | 'memUse' | 'memReq' | 'memLim';

	// Per-card series from both stacks, unioned into one request. DCGM measures and cannot be
	// bypassed; HAMi books and can be. Usage therefore reads `DCGM_FI_DEV_FB_USED` — HAMi's
	// `hami_host_gpu_memory_used_bytes` is total−free, so it counts the driver's reserved frame
	// buffer and never reads zero. HAMi's per-container series are unusable too: HAMi-core only
	// emits them while a vGPU container runs.
	const GPU_QUERIES = {
		// Labelled Hostname/UUID/modelName/device — the anchor every other DCGM series joins to.
		total: DCGM_GPU_MEMORY_TOTAL_BYTES,
		used: DCGM_GPU_MEMORY_USED_BYTES,
		util: 'DCGM_FI_DEV_GPU_UTIL',
		// Drops below boost when the card throttles; next to temperature it separates
		// "hot and slowing down" from "hot but fine".
		smClock: 'DCGM_FI_DEV_SM_CLOCK',
		temperature: 'DCGM_FI_DEV_GPU_TEMP',
		power: 'DCGM_FI_DEV_POWER_USAGE',
		// Silicon wear and link quality: cumulative, and should never leave zero, so they earn a
		// flag rather than three columns that would read 0 forever.
		remappedUncorrectable: 'DCGM_FI_DEV_UNCORRECTABLE_REMAPPED_ROWS',
		remapFailure: 'DCGM_FI_DEV_ROW_REMAP_FAILURE',
		pcieReplay: 'DCGM_FI_DEV_PCIE_REPLAY_COUNTER',
		// Scheduler gauge: memory handed out to pods.
		allocated: 'sum by (device_uuid) (hami_gpu_memory_allocated_bytes)',
		// Unaggregated so each series keeps its owning pod's labels; folded into consumers in JS.
		consumers: 'hami_vgpu_memory_allocated_bytes'
	};

	let rows = $state<NodeRow[]>([]);
	let isLoaded = $state(false);

	// Sum a GPU field across a node's devices; undefined when none report it (cell renders "—").
	function sumGpuField(gpus: GpuDevice[], key: 'allocated' | 'used' | 'total'): number | undefined {
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

	// Mean of a GPU field across a node's devices — utilization doesn't add up across cards.
	function avgGpuField(gpus: GpuDevice[], key: 'util'): number | undefined {
		let sum = 0;
		let count = 0;
		for (const gpu of gpus) {
			const value = gpu[key];
			if (typeof value === 'number' && Number.isFinite(value)) {
				sum += value;
				count += 1;
			}
		}
		return count > 0 ? sum / count : undefined;
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

	// Index one query's series by the label its exporter keys cards on.
	function numbersByLabel(vectors: InstantVector[], label: string): Record<string, number> {
		const out: Record<string, number> = {};
		for (const series of vectors) {
			const key = (series.metric.labels as Record<string, string>)[label];
			const value = Number(series.value?.value);
			if (key && Number.isFinite(value)) out[key] = value;
		}
		return out;
	}

	// Fetch GPU devices, grouped by node name (DCGM's `Hostname` label == the K8s node name).
	async function fetchGpusByNode(): Promise<Record<string, GpuDevice[]>> {
		try {
			const r = await fetchCombinedInstant(prometheusDriver, GPU_QUERIES);

			// DCGM keys its cards on `UUID`, HAMi on `device_uuid` — same value, different label.
			const used = numbersByLabel(r.used, 'UUID');
			const util = numbersByLabel(r.util, 'UUID');
			const smClock = numbersByLabel(r.smClock, 'UUID');
			const temperature = numbersByLabel(r.temperature, 'UUID');
			const power = numbersByLabel(r.power, 'UUID');
			const remappedUncorrectable = numbersByLabel(r.remappedUncorrectable, 'UUID');
			const remapFailure = numbersByLabel(r.remapFailure, 'UUID');
			const pcieReplay = numbersByLabel(r.pcieReplay, 'UUID');
			const allocated = numbersByLabel(r.allocated, 'device_uuid');

			// Fold the per-pod allocation series into deduped consumers (same ns/pod summed).
			const consumersByUuid: Record<string, Record<string, GpuConsumer>> = {};
			for (const series of r.consumers) {
				const labels = series.metric.labels as Record<string, string>;
				const uuid = labels.device_uuid;
				if (!uuid) continue;
				const value = Number(series.value?.value);
				const consumed = Number.isFinite(value) ? value : undefined;
				// The exporter's own `namespace`/`pod` labels win the scrape, so HAMi's workload
				// labels arrive prefixed; fall back to the bare names for scrapes without honor_labels.
				const namespace = labels.exported_namespace ?? labels.namespace ?? '';
				const pod = labels.exported_pod ?? labels.pod ?? '';
				if (!namespace && !pod) continue;
				const byKey = (consumersByUuid[uuid] ??= {});
				const key = `${namespace}/${pod}`;
				const existing = byKey[key];
				if (existing) {
					if (consumed !== undefined) existing.allocated = (existing.allocated ?? 0) + consumed;
				} else {
					byKey[key] = { namespace, pod, allocated: consumed };
				}
			}

			const byNode: Record<string, GpuDevice[]> = {};
			for (const series of r.total) {
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
					allocated: allocated[uuid],
					used: used[uuid],
					util: util[uuid],
					smClock: smClock[uuid],
					temperature: temperature[uuid],
					power: power[uuid],
					remappedUncorrectable: remappedUncorrectable[uuid],
					remapFailure: remapFailure[uuid],
					pcieReplay: pcieReplay[uuid],
					consumers: Object.values(consumersByUuid[uuid] ?? {}),
					governance: classifyGpuGovernance(allocated[uuid], used[uuid])
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
					gpus: [],
					disks: {}
				});
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const labels = v.metric.labels as Record<string, string>;
					const node = labels.node;
					if (!node) continue;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					if (key === 'diskUsed' || key === 'diskTotal') {
						const deviceClass = labels.device_class;
						if (!deviceClass) continue;
						const pool = (ensure(node).disks[deviceClass] ??= {});
						if (key === 'diskUsed') pool.used = value;
						else pool.total = value;
					} else if (key === 'diskWrite' || key === 'diskRead') {
						ensure(node)[key] = value;
					} else {
						ensure(node)[key as PressureKey] = value;
					}
				}
			}
			// Seed rows from GPU hosts too (a node may have GPUs but no pressure series).
			for (const node of Object.keys(gpusByNode)) ensure(node);
			for (const row of Object.values(byNode)) {
				row.gpus = gpusByNode[row.node] ?? [];
				row.gpuAllocated = sumGpuField(row.gpus, 'allocated');
				row.gpuUsed = sumGpuField(row.gpus, 'used');
				row.gpuTotal = sumGpuField(row.gpus, 'total');
				row.gpuAllocPct = ratioPct(row.gpuAllocated, row.gpuTotal);
				row.gpuUsedPct = ratioPct(row.gpuUsed, row.gpuTotal);
				row.gpuUtil = avgGpuField(row.gpus, 'util');
				for (const pool of Object.values(row.disks)) {
					pool.usePct = ratioPct(pool.used, pool.total);
				}
			}
			rows = Object.values(byNode).sort((a, b) => pressure(b) - pressure(a));
		} catch (error) {
			console.error('Failed to fetch node pressure:', error);
		}
	}

	// Worst reservation pressure on a node (CPU/Mem/GPU booking) — what blocks scheduling.
	function pressure(row: NodeRow): number {
		return Math.max(row.cpuReq, row.cpuLim, row.memReq, row.memLim, row.gpuAllocPct ?? 0);
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

	// Sub-columns of the full view, grouped under a spanning header per resource.
	const CPU_COLUMNS: { key: PressureKey; label: string }[] = [
		{ key: 'cpuUse', label: m.usage() },
		{ key: 'cpuReq', label: m.request() },
		{ key: 'cpuLim', label: m.limit() }
	];
	const MEM_COLUMNS: { key: PressureKey; label: string }[] = [
		{ key: 'memUse', label: m.usage() },
		{ key: 'memReq', label: m.request() },
		{ key: 'memLim', label: m.limit() }
	];

	// GPU columns/rows only render when at least one node reports a GPU.
	const hasGpu = $derived(rows.some((row) => row.gpus.length > 0));

	// One disk column per TopoLVM device class actually reported; none on clusters without the
	// phison-topolvm module.
	const diskClasses = $derived(
		[...new Set(rows.flatMap((row) => Object.keys(row.disks)))].sort((a, b) => a.localeCompare(b))
	);

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

	// Format a byte count as "12.34 Gi"; "—" when not reported. The suffix table bottoms out with
	// an empty symbol, so sub-kibibyte values would render as a bare "0.00" — name the base unit.
	function formatBytes(value: number | undefined, digits = 2): string {
		if (value === undefined || !Number.isFinite(value)) return '—';
		const { value: scaled, unit } = formatWithBinarySuffix(BigInt(Math.round(value)));
		return `${scaled.toFixed(digits)} ${unit || 'B'}`;
	}

	// Throughput is only resolvable for AI100 drives, so every other device class keeps the
	// capacity column alone.
	function diskColumns(deviceClass: string): number {
		return deviceClass === AI100_DEVICE_CLASS ? 3 : 1;
	}

	// Throughput shares a row with four-character percentages, so it is compressed to eight:
	// decimals give way as the integer part grows, and the unit drops its byte letter.
	const SHORT_RATE_UNITS: Record<string, string> = {
		'B/s': 'B/s',
		'KB/s': 'K/s',
		'MB/s': 'M/s',
		'GB/s': 'G/s',
		'TB/s': 'T/s'
	};

	function rateMantissa(scaled: number): string {
		const magnitude = Math.abs(scaled);
		return scaled.toFixed(magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2);
	}

	function formatPct(value: number | undefined): string {
		return value === undefined || !Number.isFinite(value) ? '—' : `${Math.round(value)}%`;
	}

	function formatUnit(value: number | undefined, unit: string, digits = 0): string {
		return value === undefined || !Number.isFinite(value)
			? '—'
			: `${value.toFixed(digits)} ${unit}`;
	}

	// Reported only once a counter has left zero. Worded at metric level — that is what an
	// operator will grep the exporter for.
	function gpuFaults(gpu: GpuDevice): string[] {
		const faults: string[] = [];
		if ((gpu.remappedUncorrectable ?? 0) > 0) {
			faults.push(`Uncorrectable remapped rows: ${gpu.remappedUncorrectable}`);
		}
		if ((gpu.remapFailure ?? 0) > 0) faults.push(`Row remap failure: ${gpu.remapFailure}`);
		if ((gpu.pcieReplay ?? 0) > 0) faults.push(`PCIe replays: ${gpu.pcieReplay}`);
		return faults;
	}

	// Beyond this many rows the table moves into a fixed-height ScrollArea instead of growing.
	const SCROLL_AFTER = 5;
</script>

<!-- Extra detail on an inline value. Tooltip.Trigger renders a <button>, which a table cell
     can't afford, so it is projected onto a span; the dotted underline advertises the hover. -->
{#snippet hint(label: string, content: string)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="cursor-help underline decoration-dotted underline-offset-4">
					{label}
					<!-- The only path to this value without a pointer. A tab stop per cell would bury the
					     table's real controls. -->
					<span class="sr-only">{content}</span>
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-xs">
			<p class="font-mono text-xs break-all">{content}</p>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<!-- Faults sit on the device name rather than claiming three columns that read zero forever. -->
{#snippet faultMark(faults: string[])}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class="cursor-help">
					<TriangleAlertIcon class="inline size-4 shrink-0 text-destructive" />
					<span class="sr-only">{faults.join('; ')}</span>
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content class="max-w-xs">
			<ul class="text-xs">
				{#each faults as fault (fault)}
					<li>{fault}</li>
				{/each}
			</ul>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

{#snippet pctCell(value: number | undefined, colored = true)}
	<Table.Cell
		class={cn(
			'text-right font-mono tabular-nums',
			colored && value !== undefined && pctClass(value)
		)}
	>
		{formatPct(value)}
	</Table.Cell>
{/snippet}

<!-- Fixed width at every value so the column doesn't resize on each reload: a 4ch slot absorbs
     the mantissa's swing (`123` vs `1024`), then one gap character and a three-character unit. -->
<!-- The workloads sharing one card, as a count — listing them inline made a row as tall as the
     card had pods. `?` marks memory in use that HAMi never booked; it rides alongside the count
     rather than replacing it, because a card can carry scheduled pods and an escapee at once. -->
{#snippet consumersCell(gpu: GpuDevice)}
	{@const consumers = gpu.consumers}
	{@const unattributed = gpu.governance.level === 'unmanaged' ? gpu.governance.bytes : undefined}
	{@const note =
		unattributed === undefined
			? undefined
			: m.gpu_unattributed_pods({ amount: formatBytes(unattributed) })}
	<Table.Cell class="text-right font-mono tabular-nums">
		{#if consumers.length === 0 && unattributed === undefined}
			—
		{:else}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<span {...props} class="cursor-help underline decoration-dotted underline-offset-4">
							{#if consumers.length}{consumers.length}{/if}{#if unattributed !== undefined}<span
									class={cn('text-destructive', consumers.length && 'ml-1')}
									>{consumers.length ? '+ ?' : '?'}</span
								>{/if}
							<span class="sr-only">
								{[
									...consumers.map((c) => `${workspaceOf(c.namespace)} / ${c.pod}`),
									...(note ? [note] : [])
								].join('; ')}
							</span>
						</span>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content class="max-w-sm">
					<div class="grid gap-1.5 text-xs">
						{#if consumers.length}
							<ul class="grid gap-1">
								{#each consumers as consumer (consumer.namespace + '/' + consumer.pod)}
									<li class="flex items-baseline gap-2 whitespace-nowrap">
										<!-- Tooltips render on `bg-foreground`, so the muted tone comes from opacity —
										     `text-muted-foreground` is tuned for the opposite ground. -->
										<span class="text-background/70">{workspaceOf(consumer.namespace)}</span>
										<span class="font-mono">{consumer.pod || '—'}</span>
										{#if consumer.allocated !== undefined}
											<span class="ml-auto font-mono tabular-nums">
												{formatBytes(consumer.allocated)}
											</span>
										{/if}
									</li>
								{/each}
							</ul>
						{/if}
						{#if note}
							<p class={cn(consumers.length && 'border-t border-background/20 pt-1.5')}>{note}</p>
						{/if}
					</div>
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</Table.Cell>
{/snippet}

{#snippet rateCell(value: number | undefined)}
	{@const io = value !== undefined && Number.isFinite(value) ? formatIO(Number(value)) : undefined}
	<Table.Cell class="text-right font-mono whitespace-nowrap tabular-nums">
		{#if io}
			<span class="inline-block w-[4ch] text-right">{rateMantissa(io.value)}</span><span
				class="ml-[1ch] text-muted-foreground">{SHORT_RATE_UNITS[io.unit] ?? io.unit}</span
			>
		{:else}
			—
		{/if}
	</Table.Cell>
{/snippet}

{#snippet diskCell(pool: DiskPool | undefined)}
	<Table.Cell
		class={cn(
			'text-right font-mono tabular-nums',
			pool?.usePct !== undefined && pctClass(pool.usePct)
		)}
	>
		{#if pool?.total !== undefined}
			{@render hint(
				formatPct(pool.usePct),
				`${formatBytes(pool.used)} / ${formatBytes(pool.total)}`
			)}
		{:else}
			{formatPct(pool?.usePct)}
		{/if}
	</Table.Cell>
{/snippet}

{#snippet table()}
	{@const showGpu = hasGpu}
	{@const colSpan =
		7 + (showGpu ? 3 : 0) + diskClasses.reduce((total, c) => total + diskColumns(c), 0)}
	<Table.Root>
		<Table.Header>
			<!-- Four blocks instead of a dozen flat columns. Allocated and Usage sit under GPU
			     because Utilization beside them is what stops them reading as compute. -->
			<Table.Row class="hover:bg-transparent">
				<Table.Head></Table.Head>
				<Table.Head colspan={3} class="border-l text-center whitespace-nowrap">
					{m.cpu()}
				</Table.Head>
				<Table.Head colspan={3} class="border-l text-center whitespace-nowrap">
					{m.memory()}
				</Table.Head>
				{#if showGpu}
					<Table.Head colspan={3} class="border-l text-center whitespace-nowrap">
						{m.gpu()}
					</Table.Head>
				{/if}
				{#each diskClasses as deviceClass (deviceClass)}
					<Table.Head
						colspan={diskColumns(deviceClass)}
						class="border-l text-center whitespace-nowrap"
					>
						{deviceClassLabel(deviceClass)}
					</Table.Head>
				{/each}
			</Table.Row>
			<Table.Row>
				<Table.Head>{m.node()}</Table.Head>
				{#each CPU_COLUMNS as col, index (col.key)}
					<Table.Head class={cn('text-right whitespace-nowrap', index === 0 && 'border-l')}>
						{col.label}
					</Table.Head>
				{/each}
				{#each MEM_COLUMNS as col, index (col.key)}
					<Table.Head class={cn('text-right whitespace-nowrap', index === 0 && 'border-l')}>
						{col.label}
					</Table.Head>
				{/each}
				{#if showGpu}
					<Table.Head class="border-l text-right whitespace-nowrap">
						{m.gpu_allocated()}
					</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">{m.usage()}</Table.Head>
					<Table.Head class="text-right whitespace-nowrap">{m.utilization()}</Table.Head>
				{/if}
				{#each diskClasses as deviceClass (deviceClass)}
					{#if deviceClass === AI100_DEVICE_CLASS}
						<Table.Head class="border-l text-right whitespace-nowrap">
							{m.disk_write()}
						</Table.Head>
						<Table.Head class="text-right whitespace-nowrap">{m.disk_read()}</Table.Head>
						<Table.Head class="text-right whitespace-nowrap">{m.usage()}</Table.Head>
					{:else}
						<Table.Head class="border-l text-right whitespace-nowrap">{m.usage()}</Table.Head>
					{/if}
				{/each}
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
					<Table.Cell class="font-medium">
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
									({row.gpus.length} × {gpuModel} · {formatBytes(row.gpuTotal, 0)})
								</span>
							</div>
						{:else}
							{row.node}
						{/if}
					</Table.Cell>
					{#each CPU_COLUMNS as col (col.key)}
						{@render pctCell(row[col.key])}
					{/each}
					{#each MEM_COLUMNS as col (col.key)}
						{@render pctCell(row[col.key])}
					{/each}
					{#if showGpu}
						{@render pctCell(row.gpuAllocPct)}
						{@render pctCell(row.gpuUsedPct)}
						<!-- Utilization is not pressure: a busy GPU is the goal, so it stays uncolored. -->
						{@render pctCell(row.gpuUtil, false)}
					{/if}
					{#each diskClasses as deviceClass (deviceClass)}
						{#if deviceClass === AI100_DEVICE_CLASS}
							{@render rateCell(row.diskWrite)}
							{@render rateCell(row.diskRead)}
						{/if}
						{@render diskCell(row.disks[deviceClass])}
					{/each}
				</Table.Row>
				{#if expandable && open}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={colSpan} class="bg-muted/30 p-3">
							<Table.Root>
								<Table.Header>
									<Table.Row class="hover:bg-transparent">
										<Table.Head>{m.type()}</Table.Head>
										<!-- UUID rides on hover: at 40 characters it was what pushed this table too wide. -->
										<Table.Head>{m.device()}</Table.Head>
										<!-- Count only: listing pods inline made this row as tall as the card had pods. -->
										<Table.Head class="text-right">{m.pods()}</Table.Head>
										<Table.Head class="text-right">{m.gpu_allocated()}</Table.Head>
										<Table.Head class="text-right">{m.usage()}</Table.Head>
										<Table.Head class="text-right">{m.total()}</Table.Head>
										<Table.Head class="text-right">{m.utilization()}</Table.Head>
										<Table.Head class="text-right">{m.clock()}</Table.Head>
										<Table.Head class="text-right">{m.temperature()}</Table.Head>
										<Table.Head class="text-right">{m.power()}</Table.Head>
									</Table.Row>
								</Table.Header>
								<Table.Body>
									{#each row.gpus as gpu, index (gpu.uuid || index)}
										{@const faults = gpuFaults(gpu)}
										<Table.Row class="border-none">
											<Table.Cell class="whitespace-nowrap">{gpu.modelName || '—'}</Table.Cell>
											<Table.Cell class="font-mono whitespace-nowrap">
												<span class="inline-flex items-center gap-1.5">
													{#if faults.length}
														{@render faultMark(faults)}
													{/if}
													{#if gpu.uuid}
														{@render hint(gpu.device || '—', gpu.uuid)}
													{:else}
														{gpu.device || '—'}
													{/if}
												</span>
											</Table.Cell>
											{@render consumersCell(gpu)}
											<!-- No warning here: a booking runs ahead of usage for as long as a model takes to load its
											     weights, so flagging the gap fired on every startup. Usage outrunning the booking shows
											     as the `?` in Pods instead. -->
											<Table.Cell class="text-right font-mono tabular-nums">
												{formatBytes(gpu.allocated)}
											</Table.Cell>
											<Table.Cell class="text-right font-mono tabular-nums">
												{formatBytes(gpu.used)}
											</Table.Cell>
											<Table.Cell class="text-right font-mono tabular-nums">
												{formatBytes(gpu.total)}
											</Table.Cell>
											<Table.Cell class="text-right font-mono tabular-nums">
												{formatPct(gpu.util)}
											</Table.Cell>
											<Table.Cell class="text-right font-mono tabular-nums">
												{formatUnit(gpu.smClock, 'MHz')}
											</Table.Cell>
											<Table.Cell class="text-right font-mono tabular-nums">
												{formatUnit(gpu.temperature, '°C')}
											</Table.Cell>
											<Table.Cell class="text-right font-mono tabular-nums">
												{formatUnit(gpu.power, 'W', 1)}
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
				{@render table()}
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
				{@render table()}
			</ScrollArea>
		{:else}
			{@render table()}
		{/if}
	</Statistics.Content>
</Statistics.Root>

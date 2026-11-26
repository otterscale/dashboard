<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { InstantVector, PrometheusDriver } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';
	import { SvelteSet } from 'svelte/reactivity';

	import { page } from '$app/state';
	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Chip, Meter, NUM, Panel, Status, widgetState } from '$lib/components/dashboard/kit';
	import { CAPACITY_THRESHOLDS, formatDuration } from '$lib/components/dashboard/kit/format';
	import { formatWithBinarySuffix } from '$lib/components/dynamic-table/utils';
	import { buttonVariants } from '$lib/components/ui/button';
	import { ScrollArea } from '$lib/components/ui/scroll-area';
	import * as Sheet from '$lib/components/ui/sheet';
	import * as Table from '$lib/components/ui/table/index.js';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { formatIO } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		ai100DiskRateByNode,
		AIDAPTIV_CACHE_DEVICE_CLASS,
		classifyGpuGovernance,
		classifyThreshold,
		DCGM_GPU_MEMORY_TOTAL_BYTES,
		DCGM_GPU_MEMORY_USED_BYTES,
		deviceClassLabel,
		fetchCombinedInstantOrNull,
		type GpuGovernance,
		LIVE_PODS,
		thresholdClasses
	} from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { Clock } from './clock';
	import type { ClusterSignals } from './signals.svelte';

	let {
		prometheusDriver,
		isReloading = $bindable(),
		signals
	}: {
		prometheusDriver: PrometheusDriver;
		isReloading: boolean;
		signals: ClusterSignals;
	} = $props();

	const transport = getContext<Transport>('transport');
	const resourceClient = createClient(ResourceService, transport);

	// namespace → workspace name (Workspace CRD owns one namespace via `spec.namespace`).
	let namespaceToWorkspace = $state.raw<Record<string, string>>({});

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
		// Labelled hostname/UUID/modelName/device — the anchor every other DCGM series joins to.
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

	// What Prometheus last answered with, most saturated first. Replaced whole by each fetch.
	let rows = $state.raw<NodeRow[]>([]);
	let isLoaded = $state(false);
	let failed = $state(false);

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

	// Fetch GPU devices, grouped by node name (DCGM's `hostname` label == the K8s node name).
	// Null when the request failed, so a failed poll is not read as "no GPUs".
	async function fetchGpusByNode(): Promise<Record<string, GpuDevice[]> | null> {
		const r = await fetchCombinedInstantOrNull(prometheusDriver, GPU_QUERIES);
		if (!r) return null;

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
			const host = labels.hostname;
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
	}

	// A node nothing has been reported for yet.
	function emptyRow(node: string): NodeRow {
		return {
			node,
			cpuUse: 0,
			cpuReq: 0,
			cpuLim: 0,
			memUse: 0,
			memReq: 0,
			memLim: 0,
			gpus: [],
			disks: {}
		};
	}

	// The cards of the last GPU answer, kept through a failed one.
	let lastGpusByNode: Record<string, GpuDevice[]> = {};

	async function fetch() {
		try {
			const [result, gpus] = await Promise.all([
				fetchCombinedInstantOrNull(prometheusDriver, queries),
				fetchGpusByNode()
			]);
			failed = result === null;
			if (!result) return;
			const gpusByNode = (lastGpusByNode = gpus ?? lastGpusByNode);
			const byNode: Record<string, NodeRow> = {};
			const ensure = (node: string): NodeRow => (byNode[node] ??= emptyRow(node));
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
	// Limits are left out: summed limits above allocatable are ordinary and block nothing.
	function pressure(row: NodeRow): number {
		return Math.max(row.cpuReq, row.memReq, row.gpuAllocPct ?? 0);
	}

	function pctClass(value: number): string {
		return thresholdClasses(classifyThreshold(value, CAPACITY_THRESHOLDS)).text;
	}

	// A row and what `signals` knows about its node, worked out once for both layouts.
	type NodeView = {
		row: NodeRow;
		// A node that is not Ready reports stale or no numbers, so its cells read "—" instead.
		down: boolean;
		master: boolean;
		// Has cards, or advertises nvidia.com/gpu: such a row opens onto its per-card detail.
		gpuNode: boolean;
		saturated: boolean;
		gpuModel: string;
	};

	// Every known node gets a row: one that stopped reporting has no usage series but is the row
	// that matters. They are joined here rather than in fetch(), so the row is there whichever of
	// the two requests answers first. Nodes that are down first, then the most saturated.
	const views = $derived.by<NodeView[]>(() => {
		const known = new Map(signals.nodes.map((node) => [node.name, node]));
		const reported = new Set(rows.map((row) => row.node));
		const unreported = signals.nodes
			.filter((node) => !reported.has(node.name))
			.map((node) => emptyRow(node.name));
		return [...rows, ...unreported]
			.map((row) => {
				const node = known.get(row.node);
				const down = node?.ready === false;
				return {
					row,
					down,
					master: node?.isMaster === true,
					gpuNode: row.gpus.length > 0 || node?.hasGpu === true,
					saturated: !down && pressure(row) >= 100,
					gpuModel:
						[...new Set(row.gpus.map((gpu) => gpu.modelName).filter(Boolean))].join(', ') || 'GPU'
				};
			})
			.sort((a, b) => Number(b.down) - Number(a.down));
	});

	const clock = new Clock();

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
	// Limit has no column: summed limits past allocatable are ordinary and block nothing, so it
	// rides on Request as a tooltip (`limit`).
	type PressureColumn = { key: PressureKey; label: string; limit?: PressureKey };
	const CPU_COLUMNS: PressureColumn[] = [
		{ key: 'cpuUse', label: m.usage() },
		{ key: 'cpuReq', label: m.request(), limit: 'cpuLim' }
	];
	const MEM_COLUMNS: PressureColumn[] = [
		{ key: 'memUse', label: m.usage() },
		{ key: 'memReq', label: m.request(), limit: 'memLim' }
	];

	function limitHint(row: NodeRow, col: PressureColumn): string | undefined {
		return col.limit ? `${m.limit()} ${formatPct(row[col.limit])}` : undefined;
	}

	// GPU columns/rows only render when at least one node has a GPU.
	const hasGpu = $derived(views.some((view) => view.gpuNode));

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
		return deviceClass === AIDAPTIV_CACHE_DEVICE_CLASS ? 3 : 1;
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

	const GROUP_HEAD = 'h-8 border-l px-2.5 text-left text-sm font-[550] whitespace-nowrap';
	const SUBHEAD =
		'h-8 px-2.5 text-right text-xs font-[450] whitespace-nowrap text-muted-foreground';
	// The per-card table nests inside a node row, so it is set no taller than the row that owns
	// it: the node table's sub-column header style, and cells one text line high.
	const DETAIL_HEAD = 'h-8 px-2.5 text-xs font-[450] text-muted-foreground';
	const DETAIL_CELL = 'px-2.5 py-1.5';
	const DETAIL_NUM = cn(DETAIL_CELL, 'text-right font-mono tabular-nums');
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

{#snippet pctCell(value: number | undefined, colored = true, note?: string)}
	<Table.Cell class="px-2.5 text-right slashed-zero tabular-nums">
		<span class={cn(colored && value !== undefined && pctClass(value))}>
			{#if note}{@render hint(formatPct(value), note)}{:else}{formatPct(value)}{/if}
		</span>
		<!-- The higher the value, the darker its bar; the part past 100 % cannot fit and is left
		     to the number and its colour. -->
		<span
			class="mt-1 flex"
			style:opacity={value === undefined ? 0.35 : 0.35 + Math.min(value, 100) / 154}
		>
			<Meter {value} size="sm" />
		</span>
	</Table.Cell>
{/snippet}

<!-- One labelled value of a node card (the narrow layout). -->
{#snippet stat(label: string, value: number | undefined, colored = true, note?: string)}
	<span class="min-w-0">
		<span class="block truncate text-[0.6875rem] leading-4 text-muted-foreground">{label}</span>
		<span
			class={cn('slashed-zero tabular-nums', colored && value !== undefined && pctClass(value))}
		>
			{#if note}{@render hint(formatPct(value), note)}{:else}{formatPct(value)}{/if}
		</span>
	</span>
{/snippet}

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
	<Table.Cell class={DETAIL_NUM}>
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
				<Tooltip.Content class={consumers.length ? 'max-w-[calc(100vw-2rem)]' : 'max-w-sm'}>
					<div class="text-xs">
						{#if consumers.length}
							<table class="text-left whitespace-nowrap">
								<thead>
									<tr class="border-b border-background/20 text-background/70">
										<th class="pr-4 pb-1 font-medium">{m.workspace()}</th>
										<th class="pr-4 pb-1 font-medium">{m.pod()}</th>
										<th class="pb-1 text-right font-medium">{m.gpu_allocated()}</th>
									</tr>
								</thead>
								<tbody>
									{#each consumers as consumer (consumer.namespace + '/' + consumer.pod)}
										<tr class="align-baseline">
											<td class="pt-1 pr-4">{workspaceOf(consumer.namespace)}</td>
											<td class="pt-1 pr-4 font-mono break-all whitespace-normal">
												{consumer.pod || '—'}
											</td>
											<td class="pt-1 text-right font-mono tabular-nums">
												{consumer.allocated === undefined ? '—' : formatBytes(consumer.allocated)}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						{/if}
						{#if note}
							<p
								class={cn(
									consumers.length && 'mt-1.5 w-0 min-w-full border-t border-background/20 pt-1.5'
								)}
							>
								{note}
							</p>
						{/if}
					</div>
				</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</Table.Cell>
{/snippet}

<!-- Fixed width at every value so the column doesn't resize on each reload: a 4ch slot absorbs
     the mantissa's swing (`123` vs `1024`), then one gap character and a three-character unit. -->
{#snippet rateCell(value: number | undefined)}
	{@const io = value !== undefined && Number.isFinite(value) ? formatIO(Number(value)) : undefined}
	<Table.Cell class="px-2.5 text-right whitespace-nowrap slashed-zero tabular-nums">
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
			'px-2.5 text-right slashed-zero tabular-nums',
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
	{@const colSpan =
		1 +
		CPU_COLUMNS.length +
		MEM_COLUMNS.length +
		(hasGpu ? 3 : 0) +
		diskClasses.reduce((total, c) => total + diskColumns(c), 0)}
	<Table.Root>
		<Table.Header>
			<!-- Four blocks instead of a dozen flat columns. Allocated and Usage sit under GPU
			     because Utilization beside them is what stops them reading as compute. -->
			<Table.Row class="border-none hover:bg-transparent">
				<Table.Head class="sticky left-0 z-10 h-8 bg-card"></Table.Head>
				<Table.Head colspan={CPU_COLUMNS.length} class={GROUP_HEAD}>
					{m.cpu()}
				</Table.Head>
				<Table.Head colspan={MEM_COLUMNS.length} class={GROUP_HEAD}>
					{m.memory()}
				</Table.Head>
				{#if hasGpu}
					<Table.Head colspan={3} class={GROUP_HEAD}>
						{m.gpu()}
					</Table.Head>
				{/if}
				{#each diskClasses as deviceClass (deviceClass)}
					<Table.Head colspan={diskColumns(deviceClass)} class={GROUP_HEAD}>
						{deviceClassLabel(deviceClass)}
					</Table.Head>
				{/each}
			</Table.Row>
			<Table.Row>
				<Table.Head
					class="sticky left-0 z-10 h-8 bg-card pl-0 text-xs font-[450] text-muted-foreground"
					>{m.node()}</Table.Head
				>
				{#each CPU_COLUMNS as col, index (col.key)}
					<Table.Head class={cn(SUBHEAD, index === 0 && 'border-l')}>
						{col.label}
					</Table.Head>
				{/each}
				{#each MEM_COLUMNS as col, index (col.key)}
					<Table.Head class={cn(SUBHEAD, index === 0 && 'border-l')}>
						{col.label}
					</Table.Head>
				{/each}
				{#if hasGpu}
					<Table.Head class={cn(SUBHEAD, 'border-l')}>
						{m.gpu_allocated()}
					</Table.Head>
					<Table.Head class={SUBHEAD}>{m.usage()}</Table.Head>
					<Table.Head class={SUBHEAD}>{m.utilization()}</Table.Head>
				{/if}
				{#each diskClasses as deviceClass (deviceClass)}
					{#if deviceClass === AIDAPTIV_CACHE_DEVICE_CLASS}
						<Table.Head class={cn(SUBHEAD, 'border-l')}>
							{m.disk_write()}
						</Table.Head>
						<Table.Head class={SUBHEAD}>{m.disk_read()}</Table.Head>
						<Table.Head class={SUBHEAD}>{m.usage()}</Table.Head>
					{:else}
						<Table.Head class={cn(SUBHEAD, 'border-l')}>{m.usage()}</Table.Head>
					{/if}
				{/each}
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each views as view (view.row.node)}
				{@const { row, down, saturated, gpuNode: expandable, gpuModel } = view}
				{@const open = expandedNodes.has(row.node)}
				<Table.Row
					class={cn('group/row h-14', expandable && 'cursor-pointer')}
					onclick={expandable ? () => toggleNode(row.node) : undefined}
				>
					<Table.Cell
						class="sticky left-0 z-10 bg-card py-2 pl-0 group-hover/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--card))]"
					>
						<div class="flex items-center gap-2 whitespace-nowrap">
							{#if expandable}
								<!-- The row's click is a pointer convenience; this is the control a keyboard
								     or a screen reader reaches. It stops the click so the row does not undo it. -->
								<button
									type="button"
									class="shrink-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
									aria-expanded={open}
									aria-label={row.node}
									onclick={(event) => {
										event.stopPropagation();
										toggleNode(row.node);
									}}
								>
									<ChevronRightIcon
										class={cn(
											'size-4 text-muted-foreground transition-transform',
											open && 'rotate-90'
										)}
									/>
								</button>
							{/if}
							<div class="min-w-0">
								<p class="flex items-center gap-2 font-mono text-[0.8125rem] leading-5">
									<!-- Long generated names (56 characters on one test node) would widen the
									     column and push the numbers off the card; the full name is on hover. -->
									<span class="max-w-[18rem] truncate" title={row.node}>{row.node}</span>
									{@render roleBadges(view)}
									<!-- A word and an icon, not a tinted row. -->
									{#if saturated}
										<Status tone="bad" variant="pill" class="font-sans"
											>{m.dashboard_overcommitted()}</Status
										>
									{/if}
								</p>
								{#if down}
									{@render notResponding(row)}
								{:else if expandable && row.gpus.length > 0}
									<p class="text-[0.6875rem] leading-4 text-muted-foreground">
										{row.gpus.length} × {gpuModel}, {formatBytes(row.gpuTotal, 0)}
									</p>
								{/if}
							</div>
						</div>
					</Table.Cell>
					{#each CPU_COLUMNS as col (col.key)}
						{@render pctCell(
							down ? undefined : row[col.key],
							true,
							down ? undefined : limitHint(row, col)
						)}
					{/each}
					{#each MEM_COLUMNS as col (col.key)}
						{@render pctCell(
							down ? undefined : row[col.key],
							true,
							down ? undefined : limitHint(row, col)
						)}
					{/each}
					{#if hasGpu}
						{@render pctCell(down ? undefined : row.gpuAllocPct)}
						{@render pctCell(down ? undefined : row.gpuUsedPct)}
						<!-- Utilization is not pressure: a busy GPU is the goal, so it stays uncolored. -->
						{@render pctCell(down ? undefined : row.gpuUtil, false)}
					{/if}
					{#each diskClasses as deviceClass (deviceClass)}
						{#if deviceClass === AIDAPTIV_CACHE_DEVICE_CLASS}
							{@render rateCell(down ? undefined : row.diskWrite)}
							{@render rateCell(down ? undefined : row.diskRead)}
						{/if}
						{@render diskCell(down ? undefined : row.disks[deviceClass])}
					{/each}
				</Table.Row>
				{#if expandable && open}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={colSpan} class="rounded-lg bg-muted/50 px-3 py-2">
							{@render gpuDetail(row, down)}
						</Table.Cell>
					</Table.Row>
				{/if}
			{/each}
		</Table.Body>
	</Table.Root>
{/snippet}

<!-- What a node is: Master from its node-role label, GPU when it advertises nvidia.com/gpu,
     CPU otherwise. A master with GPUs is both. -->
{#snippet roleBadges(view: NodeView)}
	{@const { master, gpuNode: gpu } = view}
	{#each [...(master ? [m.node_role_master()] : []), ...(gpu ? [m.node_role_gpu()] : []), ...(!master && !gpu ? [m.node_role_cpu()] : [])] as role (role)}
		<Chip class="font-sans text-[0.6875rem] leading-4">{role}</Chip>
	{/each}
{/snippet}

<!-- A not-Ready node, with how long KubeNodeNotReady has fired when that is known. -->
{#snippet notResponding(row: NodeRow)}
	{@const since = signals.notReadySince(row.node)}
	<Status tone="bad" variant="pill" class="mt-0.5 text-[0.6875rem]">
		{m.node_not_responding()}{#if since !== undefined}{` · ${formatDuration(clock.now / 1000 - since)}`}{/if}
	</Status>
{/snippet}

{#snippet gpuDetail(row: NodeRow, down: boolean)}
	{#if down || row.gpus.length === 0}
		<p class="px-1 py-1.5 text-xs text-muted-foreground">
			{down ? m.gpu_no_data_not_responding() : m.no_data_display()}
		</p>
	{:else}
		{@render gpuTable(row)}
	{/if}
{/snippet}

<!-- Per-card detail of one node; shared by the table's expanded row and the node card. -->
{#snippet gpuTable(row: NodeRow)}
	<Table.Root>
		<Table.Header>
			<Table.Row class="hover:bg-transparent">
				<Table.Head class={DETAIL_HEAD}>{m.type()}</Table.Head>
				<!-- UUID rides on hover: at 40 characters it was what pushed this table too wide. -->
				<Table.Head class={DETAIL_HEAD}>{m.device()}</Table.Head>
				<!-- Count only: listing pods inline made this row as tall as the card had pods. -->
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.pods()}</Table.Head>
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.gpu_allocated()}</Table.Head>
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.usage()}</Table.Head>
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.total()}</Table.Head>
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.utilization()}</Table.Head>
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.clock()}</Table.Head>
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.temperature()}</Table.Head>
				<Table.Head class={cn(DETAIL_HEAD, 'text-right')}>{m.power()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each row.gpus as gpu, index (gpu.uuid || index)}
				{@const faults = gpuFaults(gpu)}
				<Table.Row class="border-none">
					<Table.Cell class={DETAIL_CELL}>{gpu.modelName || '—'}</Table.Cell>
					<Table.Cell class={cn(DETAIL_CELL, 'font-mono')}>
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
					<Table.Cell class={DETAIL_NUM}>
						{formatBytes(gpu.allocated)}
					</Table.Cell>
					<Table.Cell class={DETAIL_NUM}>
						{formatBytes(gpu.used)}
					</Table.Cell>
					<Table.Cell class={DETAIL_NUM}>
						{formatBytes(gpu.total)}
					</Table.Cell>
					<Table.Cell class={DETAIL_NUM}>
						{formatPct(gpu.util)}
					</Table.Cell>
					<Table.Cell class={DETAIL_NUM}>
						{formatUnit(gpu.smClock, 'MHz')}
					</Table.Cell>
					<Table.Cell class={DETAIL_NUM}>
						{formatUnit(gpu.temperature, '°C')}
					</Table.Cell>
					<Table.Cell class={DETAIL_NUM}>
						{formatUnit(gpu.power, 'W', 1)}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
{/snippet}

<!-- Below this width ten numeric columns stop being a table: one card per node instead. -->
{#snippet cards()}
	<!-- `minmax(0, 1fr)`: an expanded card's GPU table scrolls inside the card instead of widening
	     the column, and with it every card, past the panel. -->
	<ul class="grid grid-cols-[minmax(0,1fr)] gap-2">
		{#each views as view (view.row.node)}
			{@const { row, down, saturated, gpuNode: expandable, gpuModel } = view}
			{@const open = expandedNodes.has(row.node)}
			<li class="rounded-lg bg-muted/60 p-3">
				<button
					type="button"
					class="flex w-full items-center justify-between gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
					disabled={!expandable}
					aria-expanded={expandable ? open : undefined}
					onclick={() => toggleNode(row.node)}
				>
					<span class="min-w-0">
						<span class="flex min-w-0 items-center gap-2">
							<span class="truncate font-mono text-[0.8125rem] leading-5" title={row.node}>
								{row.node}
							</span>
							{@render roleBadges(view)}
						</span>
						{#if down}
							{@render notResponding(row)}
						{:else if expandable && row.gpus.length > 0}
							<span class="block truncate text-[0.6875rem] leading-4 text-muted-foreground">
								{row.gpus.length} × {gpuModel}, {formatBytes(row.gpuTotal, 0)}
							</span>
						{/if}
					</span>
					{#if expandable}
						<ChevronRightIcon
							class={cn(
								'size-4 shrink-0 text-muted-foreground transition-transform',
								open && 'rotate-90'
							)}
						/>
					{/if}
				</button>
				<div
					class="mt-2 grid grid-cols-[4rem_repeat(3,minmax(0,1fr))] items-baseline gap-x-2 gap-y-1.5 text-sm"
				>
					<span class="font-[550]">{m.cpu()}</span>
					{#each CPU_COLUMNS as col (col.key)}
						{@render stat(
							col.label,
							down ? undefined : row[col.key],
							true,
							down ? undefined : limitHint(row, col)
						)}
					{/each}
					<!-- Two stats in a three-column row: hold the GPU row's third slot. -->
					<span></span>
					<span class="font-[550]">{m.memory()}</span>
					{#each MEM_COLUMNS as col (col.key)}
						{@render stat(
							col.label,
							down ? undefined : row[col.key],
							true,
							down ? undefined : limitHint(row, col)
						)}
					{/each}
					<!-- Two stats in a three-column row: hold the GPU row's third slot. -->
					<span></span>
					{#if hasGpu}
						<span class="font-[550]">{m.gpu()}</span>
						{@render stat(m.gpu_allocated(), down ? undefined : row.gpuAllocPct)}
						{@render stat(m.usage(), down ? undefined : row.gpuUsedPct)}
						{@render stat(m.utilization(), down ? undefined : row.gpuUtil, false)}
					{/if}
					{#each diskClasses as deviceClass (deviceClass)}
						<span class="truncate font-[550]" title={deviceClassLabel(deviceClass)}>
							{deviceClassLabel(deviceClass)}
						</span>
						{@render stat(m.usage(), down ? undefined : row.disks[deviceClass]?.usePct)}
						<span></span>
						<span></span>
					{/each}
				</div>
				{#if saturated}
					<Status tone="bad" variant="pill" class="mt-2">{m.dashboard_overcommitted()}</Status>
				{/if}
				{#if expandable && open}
					<div class="mt-2 rounded-md bg-card p-2">
						{@render gpuDetail(row, down)}
					</div>
				{/if}
			</li>
		{/each}
	</ul>
{/snippet}

<Panel
	title={m.node_resource_pressure()}
	description={m.cluster_dashboard_node_pressure_description()}
	tooltip={m.cluster_dashboard_node_pressure_tooltip()}
	state={widgetState(isLoaded, views.length > 0, failed && rows.length === 0)}
	class="h-auto"
	bodyClass="min-h-[14.8125rem] @[39rem]/panel:min-h-[8.3125rem]"
>
	{#snippet badge()}
		{#if signals.status === 'ready'}
			<Chip class={NUM}>
				{m.nodes_ready_of_total({
					ready: String(signals.readyCount),
					total: String(signals.nodes.length)
				})}
			</Chip>
		{/if}
	{/snippet}
	{#snippet actions()}
		<Sheet.Root>
			<Sheet.Trigger
				class={buttonVariants({ variant: 'ghost', size: 'icon-sm' })}
				aria-label={m.node_resource_pressure()}
			>
				<Maximize2Icon class="size-4 text-muted-foreground" />
			</Sheet.Trigger>
			<Sheet.Content class="flex min-w-[77vw] flex-col gap-4 overflow-auto p-8">
				<Sheet.Header class="p-0">
					<Sheet.Title>{m.node_resource_pressure()}</Sheet.Title>
					<Sheet.Description>{m.cluster_dashboard_node_pressure_description()}</Sheet.Description>
				</Sheet.Header>
				{@render table()}
			</Sheet.Content>
		</Sheet.Root>
	{/snippet}
	<div class="@[39rem]/panel:hidden">
		{@render cards()}
	</div>
	<div class="hidden @[39rem]/panel:block">
		{#if views.length > SCROLL_AFTER}
			<ScrollArea
				class={cn('w-full transition-[height] duration-200', anyExpanded ? 'h-[40rem]' : 'h-80')}
			>
				{@render table()}
			</ScrollArea>
		{:else}
			{@render table()}
		{/if}
	</div>
</Panel>

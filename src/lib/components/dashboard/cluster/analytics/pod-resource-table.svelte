<script lang="ts">
	import ArrowDownIcon from '@lucide/svelte/icons/arrow-down';
	import ArrowUpIcon from '@lucide/svelte/icons/arrow-up';
	import ChevronsUpDownIcon from '@lucide/svelte/icons/chevrons-up-down';
	import Maximize2Icon from '@lucide/svelte/icons/maximize-2';
	import type { PrometheusDriver } from 'prometheus-query';

	import { page } from '$app/state';
	import { orThrow, useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import { dataTable, levelOf, levelText } from '$lib/components/dashboard/shared/status';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { GpuAllocationDialog } from '$lib/components/gpu-allocation';
	import { Button } from '$lib/components/shadcnio/button';
	import {
		Sheet,
		SheetBody,
		SheetContent,
		SheetHeader,
		SheetTrigger
	} from '$lib/components/shadcnio/sheet';
	import { Skeleton } from '$lib/components/shadcnio/skeleton';
	import { Tooltip, TooltipContent, TooltipTrigger } from '$lib/components/shadcnio/tooltip';
	import { formatCapacity, formatDuration, formatIO } from '$lib/formatter';
	import { m } from '$lib/messages';
	import {
		escapePromqlStringLiteral,
		fetchCombinedInstantOrNull,
		LIVE_PODS
	} from '$lib/prometheus';
	import { cn } from '$lib/utils';

	// Live per-pod snapshot table, scoped to one namespace or to one node. Pass exactly one;
	// `node` wins if both arrive.
	let {
		client,
		namespace,
		node,
		namespaceToWorkspace = {},
		isReloading = $bindable()
	}: {
		client: PrometheusDriver;
		namespace?: string;
		/** Kubernetes node name, not the node_exporter instance. */
		node?: string;
		/** namespace → workspace, for the identity column of the node-scoped table. */
		namespaceToWorkspace?: Record<string, string>;
		isReloading?: boolean;
	} = $props();

	const scope = $derived(
		node
			? ({ kind: 'node', value: node } as const)
			: ({ kind: 'namespace', value: namespace ?? '' } as const)
	);

	type PodRow = {
		pod: string;
		namespace: string;
		/** Owning node — the denominator for every request/limit share. */
		node: string;
		cpu: number;
		cpuRequest: number;
		cpuLimit: number;
		mem: number;
		memRequest: number;
		memLimit: number;
		// `gpuUtil` is null (not 0) when HAMi reports nothing for the pod, so idle
		// GPU pods still show "0%" while GPU-free pods show "—".
		gpuCards: number;
		gpuAllocated: number;
		gpuUsed: number;
		gpuUtil: number | null;
		restarts: number;
		ageSec: number;
		net: number;
	};

	const queries = $derived.by(() => {
		const value = escapePromqlStringLiteral(scope.value.trim());
		// cAdvisor and the KSM resource series both carry `node`, so one selector covers both scopes.
		const base = `${scope.kind}="${value}"`;
		const sel = (...matchers: string[]) => `{${matchers.filter(Boolean).join(',')}}`;
		// cAdvisor metrics: scope to a real container, never the pause sandbox.
		const real = ['container!=""', 'container!="POD"'];
		// KSM's restart and creation series carry no `node`, so a node-scoped table narrows them by
		// intersecting with the pods `kube_pod_info` places on that node.
		const onScope = scope.kind === 'node' ? `and on (namespace, pod) (kube_pod_info{${base}})` : '';
		const ksmBase = scope.kind === 'node' ? '' : base;
		// The KSM-derived series below are gated on LIVE_PODS: they outlive a pod's execution,
		// so without it every finished Job would keep its own row (0 usage, but a limit and an age).
		const spec = (kind: 'requests' | 'limits', resource: string) =>
			`sum by (namespace,pod)(kube_pod_container_resource_${kind}${sel(base, `resource="${resource}"`)} ${LIVE_PODS})`;
		// HAMi's own `namespace`/`pod` labels name the device-plugin pod that exported the sample;
		// the workload lives in `exported_*`. Aggregating by those also strips the exporter's
		// identity, which would otherwise collapse every pod onto the daemon's row.
		//
		// Only the scheduler's `allocated` series carries `node`; the device plugin's `used` and
		// `utilization` do not, so a node-scoped table fetches them cluster-wide (a handful of
		// series — one per vGPU container) and lets the scope filter below drop the strays.
		const hami = scope.kind === 'node' ? '' : `exported_namespace="${value}"`;
		const hamiAllocated = scope.kind === 'node' ? base : hami;
		return {
			cpu: `sum by (namespace,pod)(irate(container_cpu_usage_seconds_total${sel(base, ...real)}[2m]))`,
			cpuRequest: spec('requests', 'cpu'),
			cpuLimit: spec('limits', 'cpu'),
			mem: `sum by (namespace,pod)(container_memory_working_set_bytes${sel(base, ...real)})`,
			memRequest: spec('requests', 'memory'),
			memLimit: spec('limits', 'memory'),
			// KSM flattens dots to underscores; this is the whole-card count, not HAMi's vGPU slice.
			gpuCards: spec('limits', 'nvidia_com_gpu'),
			gpuAllocated: `sum by (exported_namespace,exported_pod)(hami_vgpu_memory_allocated_bytes${sel(hamiAllocated)})`,
			gpuUsed: `sum by (exported_namespace,exported_pod)(hami_vgpu_memory_used_bytes${sel(hami)})`,
			gpuUtil: `avg by (exported_namespace,exported_pod)(hami_container_device_utilization_ratio${sel(hami)})`,
			restarts: `sum by (namespace,pod)(kube_pod_container_status_restarts_total${sel(ksmBase, ...real)} ${LIVE_PODS} ${onScope})`,
			created: `max by (namespace,pod)(kube_pod_created${sel(ksmBase)} ${LIVE_PODS} ${onScope})`,
			netRx: `sum by (namespace,pod)(irate(container_network_receive_bytes_total${sel(base)}[2m]))`,
			netTx: `sum by (namespace,pod)(irate(container_network_transmit_bytes_total${sel(base)}[2m]))`,
			// Placement, and the two allocatable totals the shares divide by. The allocatable series
			// carry KSM's own pod labels, so they must be aggregated down to `node`.
			podNode: `max by (namespace,pod,node)(kube_pod_info${sel(base)} ${LIVE_PODS})`,
			nodeCpu: `sum by (node)(kube_node_status_allocatable{resource="cpu"})`,
			nodeMem: `sum by (node)(kube_node_status_allocatable{resource="memory"})`
		};
	});

	// Every column is always present, GPU included: a namespace whose pods hold no GPU reads "—"
	// rather than changing the table's shape, so the same header sits in the same place everywhere.
	type SortKey =
		| 'pod'
		| 'workspace'
		| 'cpu'
		| 'cpuRequest'
		| 'cpuLimit'
		| 'mem'
		| 'memRequest'
		| 'memLimit'
		| 'gpuCards'
		| 'gpuAllocated'
		| 'gpuUsed'
		| 'gpuUtil'
		| 'restarts'
		| 'ageSec'
		| 'net';

	let sortKey = $state<SortKey | null>(null);
	let sortAscending = $state(false);

	// A fresh column starts descending — for every measure here the interesting end is the top.
	// The pod name is the exception, where alphabetical means A first.
	function toggleSort(key: SortKey) {
		if (sortKey === key) {
			sortAscending = !sortAscending;
		} else {
			sortKey = key;
			sortAscending = key === 'pod' || key === 'workspace';
		}
	}

	/** Workspace owning a namespace; falls back to the raw namespace when unmapped. */
	function workspaceOf(ns: string): string {
		return namespaceToWorkspace[ns] || ns || '—';
	}

	type Snapshot = {
		rows: PodRow[];
		cpuAllocatable: Record<string, number>;
		memAllocatable: Record<string, number>;
	};

	const snapshot = useLoadable<Snapshot>(
		async () => {
			const result = orThrow(await fetchCombinedInstantOrNull(client, queries));
			const byPod: Record<string, PodRow> = {};
			const cpuByNode: Record<string, number> = {};
			const memByNode: Record<string, number> = {};
			// Keyed by namespace/pod, not the pod name: a node-scoped table spans namespaces, where
			// two StatefulSets can both own a `foo-0`.
			const ensure = (ns: string, p: string): PodRow =>
				(byPod[`${ns}/${p}`] ??= {
					pod: p,
					namespace: ns,
					node: '',
					cpu: 0,
					cpuRequest: 0,
					cpuLimit: 0,
					mem: 0,
					memRequest: 0,
					memLimit: 0,
					gpuCards: 0,
					gpuAllocated: 0,
					gpuUsed: 0,
					gpuUtil: null,
					restarts: 0,
					ageSec: 0,
					net: 0
				});
			// `created` is an epoch timestamp → turn into an age; everything else accumulates.
			const assign: Record<
				string,
				(row: PodRow, v: number, labels: Record<string, string>) => void
			> = {
				cpu: (r, v) => (r.cpu = v),
				cpuRequest: (r, v) => (r.cpuRequest = v),
				cpuLimit: (r, v) => (r.cpuLimit = v),
				mem: (r, v) => (r.mem = v),
				memRequest: (r, v) => (r.memRequest = v),
				memLimit: (r, v) => (r.memLimit = v),
				gpuCards: (r, v) => (r.gpuCards = v),
				gpuAllocated: (r, v) => (r.gpuAllocated = v),
				gpuUsed: (r, v) => (r.gpuUsed = v),
				gpuUtil: (r, v) => (r.gpuUtil = v),
				restarts: (r, v) => (r.restarts = v),
				created: (r, v) => (r.ageSec = Math.max(0, Date.now() / 1000 - v)),
				netRx: (r, v) => (r.net += v),
				netTx: (r, v) => (r.net += v),
				podNode: (r, _v, labels) => (r.node = labels.node ?? '')
			};
			for (const [key, vectors] of Object.entries(result)) {
				for (const v of vectors) {
					const labels = v.metric.labels as Record<string, string>;
					const value = Number(v.value?.value);
					if (!Number.isFinite(value)) continue;
					// Series keyed on something other than a pod, handled before the pod lookup.
					if (key === 'nodeCpu' || key === 'nodeMem') {
						if (labels.node) (key === 'nodeCpu' ? cpuByNode : memByNode)[labels.node] = value;
						continue;
					}
					const p = labels.pod || labels.exported_pod;
					const ns = labels.namespace || labels.exported_namespace;
					if (!p || !ns) continue;
					assign[key]?.(ensure(ns, p), value, labels);
				}
			}
			// Drops the pods a cluster-wide HAMi query dragged in from other nodes.
			const inScope = (r: PodRow) =>
				scope.kind === 'node' ? r.node === scope.value : r.namespace === scope.value;
			// Order lives in `sortedRows` so a reload never undoes the column the user picked.
			const rows = Object.values(byPod).filter(inScope);
			return rows.length > 0
				? { rows, cpuAllocatable: cpuByNode, memAllocatable: memByNode }
				: null;
		},
		() => isReloading ?? false
	);

	const rows = $derived(snapshot.data?.rows ?? []);
	const cpuAllocatable = $derived(snapshot.data?.cpuAllocatable ?? {});
	const memAllocatable = $derived(snapshot.data?.memAllocatable ?? {});

	const sortedRows = $derived.by(() => {
		const list = [...rows];
		const key = sortKey;
		// Default order surfaces trouble first: most-restarted pods on top, then the heaviest.
		if (key === null) return list.sort((a, b) => b.restarts - a.restarts || b.mem - a.mem);
		const direction = sortAscending ? 1 : -1;
		if (key === 'pod') return list.sort((a, b) => direction * a.pod.localeCompare(b.pod));
		if (key === 'workspace') {
			return list.sort(
				(a, b) =>
					direction * workspaceOf(a.namespace).localeCompare(workspaceOf(b.namespace)) ||
					a.pod.localeCompare(b.pod)
			);
		}
		// `gpuUtil` is null for pods HAMi never saw; -1 keeps them below a genuine 0%.
		return list.sort((a, b) => direction * ((a[key] ?? -1) - (b[key] ?? -1)));
	});

	/** Share of the owning node's allocatable capacity, as `kubectl describe node` reports it. */
	function share(value: number, allocatable: Record<string, number>, node: string): number | null {
		const total = allocatable[node];
		return total > 0 ? (value / total) * 100 : null;
	}

	// Each numeric cell is one string right-aligned in a slot wide enough for the worst case, so a
	// reload can change every value without moving a column edge. Value and unit deliberately share
	// the slot: giving the unit its own left-aligned slot lines the units up, but leaves a blank
	// gap on every row whose value carries no unit.
	const DASH = '—';

	/** kubectl's convention: whole cores stay bare, anything else reads in millicores. */
	function formatCores(cores: number): string {
		if (cores === 0) return '0';
		if (cores >= 1 && Number.isInteger(cores)) return String(cores);
		return `${Math.round(cores * 1000)}m`;
	}

	/** Decimals give way as the integer part grows, capping the mantissa at four characters. */
	function mantissa(value: number): string {
		const magnitude = Math.abs(value);
		return value.toFixed(magnitude >= 100 ? 0 : magnitude >= 10 ? 1 : 2);
	}

	function formatBytes(bytes: number): string {
		if (bytes === 0) return '0';
		const { value, unit } = formatCapacity(bytes);
		return `${mantissa(value)} ${unit}`;
	}

	// Throughput drops the byte letter so it costs no more room than `GB`.
	const SHORT_RATE_UNITS: Record<string, string> = {
		'B/s': 'B/s',
		'KB/s': 'K/s',
		'MB/s': 'M/s',
		'GB/s': 'G/s',
		'TB/s': 'T/s'
	};

	function formatRate(bytesPerSecond: number): string {
		const { value, unit } = formatIO(bytesPerSecond);
		return `${mantissa(value)} ${SHORT_RATE_UNITS[unit] ?? unit}`;
	}

	// Usage prints no share of its own: what decides whether a pod gets throttled or OOM-killed is
	// its own limit, which sits in the next column, so the colour carries that ratio instead.
	// Uncoloured when uncapped — there is nothing to be close to. Deliberately not applied to GPU
	// memory: vLLM pre-allocates its KV cache to ~90% of the booking, so every serving pod would
	// sit permanently red.
	function usageClass(used: number, limit: number): string {
		return limit > 0 ? levelText[levelOf((used / limit) * 100)] : '';
	}
	// No restarts is the normal case and takes no colour.
	function restartClass(n: number): string {
		if (n >= 5) return 'font-bold text-destructive';
		if (n >= 1) return 'text-warning-foreground';
		return '';
	}

	const SCROLL_AFTER = 8;

	let open = $state(false);

	// The header cells stay put while the body scrolls under them, so they need an opaque ground:
	// the table's muted tint mixed onto the card instead of laid over it.
	const HEAD_GROUND = 'bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]';
	const groupHead = cn(dataTable.groupHead, HEAD_GROUND, 'sticky top-0 z-20');
	const head = cn(dataTable.head, HEAD_GROUND, 'sticky top-8 z-20');
	// First cell of a column group.
	const GROUP_START = 'border-l border-l-border/60';
	// A pod that restarted five times or more tints its whole row; the sticky name cell is opaque,
	// so it carries the same tint mixed onto the card.
	const ROW_ALERT = 'bg-destructive/5';
	const STICKY_ALERT = 'bg-[color-mix(in_oklab,var(--destructive)_5%,var(--card))]';
</script>

<!-- Sized in `ch` against a monospace face, so the widest possible sample already fits and nothing
     reflows when the values change. -->
{#snippet valueCell(text: string, width: string, klass: string)}
	<td class={cn(dataTable.cell, text === DASH && dataTable.absent, klass)}>
		<span class="inline-block text-right {width}">{text}</span>
	</td>
{/snippet}

<!-- Requests and limits carry their share of the node in a tooltip; usage never does, so a "%"
     in this table always means the same thing. -->
{#snippet specCell(text: string, pct: number | null, width: string, unset: boolean)}
	<td class={cn(dataTable.cell, unset && dataTable.absent)}>
		{#if unset || pct === null}
			<span class="inline-block text-right {width}">{text}</span>
		{:else}
			<Tooltip>
				<TooltipTrigger>
					{#snippet asChild(props)}
						<!-- The underline waits for the pointer: hundreds of permanently dotted cells would
						     be louder than the values themselves. -->
						<span
							{...props({
								class: cn(
									'inline-block cursor-help text-right underline decoration-transparent decoration-dotted underline-offset-4 hover:decoration-current',
									width
								)
							})}
						>
							{text}
							<span class="sr-only">{m.share_of_allocatable({ percent: Math.round(pct) })}</span>
						</span>
					{/snippet}
				</TooltipTrigger>
				<TooltipContent class="whitespace-nowrap">
					{m.share_of_allocatable({ percent: Math.round(pct) })}
				</TooltipContent>
			</Tooltip>
		{/if}
	</td>
{/snippet}

<!-- The sort arrow occupies its slot whether or not the column is active, so switching columns
     never resizes them. Inactive shows the both-ways chevron at low contrast — the only hint that
     a header is clickable at all. -->
{#snippet sortHead(key: SortKey, label: string, klass = '')}
	<th
		scope="col"
		class={cn(head, klass)}
		aria-sort={sortKey !== key ? 'none' : sortAscending ? 'ascending' : 'descending'}
	>
		<button
			type="button"
			class={cn(
				'inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60',
				sortKey === key && 'text-foreground'
			)}
			onclick={() => toggleSort(key)}
		>
			{label}
			{#if sortKey !== key}
				<ChevronsUpDownIcon class="size-3 shrink-0 opacity-40" aria-hidden="true" />
			{:else if sortAscending}
				<ArrowUpIcon class="size-3 shrink-0" aria-hidden="true" />
			{:else}
				<ArrowDownIcon class="size-3 shrink-0" aria-hidden="true" />
			{/if}
		</button>
	</th>
{/snippet}

<!-- The count comes from KSM, which sees every pod. Clicking it opens the node's Pod → GPU → Node
     diagram: which card, on which node, and who else shares it — more than a tooltip can hold
     without overflowing, and the same view the node kind-viewer offers. -->
{#snippet cardsCell(row: PodRow)}
	{@const cards = Math.round(row.gpuCards)}
	<td class={cn(dataTable.cell, GROUP_START, cards === 0 && dataTable.absent)}>
		{#if cards === 0}
			{DASH}
		{:else if !row.node}
			{cards}
		{:else}
			<GpuAllocationDialog
				cluster={page.params.cluster ?? ''}
				view="node"
				object={{ metadata: { name: row.node } }}
			>
				{#snippet trigger()}
					<span class="cursor-pointer underline decoration-dotted underline-offset-4">
						{cards}
					</span>
				{/snippet}
			</GpuAllocationDialog>
		{/if}
	</td>
{/snippet}

<!-- The table scrolls inside this box in both directions and never widens the page. `bounded`
     caps the height once there are more rows than fit; the two header rows and the pod name
     stay in view either way. -->
{#snippet table(bounded: boolean)}
	<!-- Focusable so the keyboard can scroll it. -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class={cn(dataTable.scroller, bounded && 'max-h-96 overflow-y-auto')}
		data-scroll-x
		role="region"
		aria-label={m.pod_detail_table()}
		tabindex="0"
	>
		<table class={dataTable.table}>
			<thead>
				<tr>
					<!-- A node-scoped table spans workspaces, which is the first thing to know about a
					     pod there; the namespace-scoped one already answers that in its title. -->
					{#if scope.kind === 'node'}
						<td class={groupHead}></td>
					{/if}
					<td class={cn(groupHead, dataTable.sticky, HEAD_GROUND, 'z-30')}></td>
					<th scope="colgroup" colspan={3} class={cn(groupHead, GROUP_START)}>{m.cpu()}</th>
					<th scope="colgroup" colspan={3} class={cn(groupHead, GROUP_START)}>{m.memory()}</th>
					<th scope="colgroup" colspan={4} class={cn(groupHead, GROUP_START)}>{m.gpu()}</th>
					<th scope="colgroup" colspan={3} class={cn(groupHead, GROUP_START)}>{m.runtime()}</th>
				</tr>
				<tr>
					{#if scope.kind === 'node'}
						{@render sortHead('workspace', m.workspace(), dataTable.headFirst)}
					{/if}
					{@render sortHead(
						'pod',
						m.pod(),
						cn(dataTable.headFirst, dataTable.sticky, HEAD_GROUND, 'z-30')
					)}
					{@render sortHead('cpu', m.usage(), GROUP_START)}
					{@render sortHead('cpuRequest', m.request())}
					{@render sortHead('cpuLimit', m.limit())}
					{@render sortHead('mem', m.usage(), GROUP_START)}
					{@render sortHead('memRequest', m.request())}
					{@render sortHead('memLimit', m.limit())}
					{@render sortHead('gpuCards', m.gpu_cards(), GROUP_START)}
					{@render sortHead('gpuAllocated', m.gpu_allocated())}
					{@render sortHead('gpuUsed', m.usage())}
					{@render sortHead('gpuUtil', m.utilization())}
					{@render sortHead('restarts', m.restarts(), GROUP_START)}
					{@render sortHead('ageSec', m.age())}
					{@render sortHead('net', m.network())}
				</tr>
			</thead>
			<tbody>
				{#each sortedRows as row (row.namespace + '/' + row.pod)}
					{@const age = formatDuration(row.ageSec)}
					{@const alert = row.restarts >= 5}
					<tr class={cn('group/row hover:bg-muted/40', alert && ROW_ALERT)}>
						{#if scope.kind === 'node'}
							<td class={cn(dataTable.cell, dataTable.cellFirst, 'font-normal')}>
								<span
									class="block max-w-24 truncate sm:max-w-40"
									title={workspaceOf(row.namespace)}
								>
									{workspaceOf(row.namespace)}
								</span>
							</td>
						{/if}
						<!-- The second identity fact rides in the tooltip rather than a second line: the
						     share percentages need the node to be readable, but a subtitle raises every
						     row's height. -->
						<th
							scope="row"
							class={cn(
								dataTable.cell,
								dataTable.cellFirst,
								dataTable.sticky,
								alert
									? STICKY_ALERT
									: 'group-hover/row:bg-[color-mix(in_oklab,var(--muted)_40%,var(--card))]'
							)}
						>
							<Tooltip>
								<TooltipTrigger>
									{#snippet asChild(props)}
										<span {...props({ class: 'block max-w-32 truncate sm:max-w-64' })}>
											{row.pod}
										</span>
									{/snippet}
								</TooltipTrigger>
								<TooltipContent class="whitespace-nowrap">
									{#if scope.kind === 'node'}
										<span class="opacity-70">{m.namespace()}</span>
										<span class="font-mono">{row.namespace || DASH}</span>
									{:else}
										<span class="opacity-70">{m.node()}</span>
										<span class="font-mono">{row.node || DASH}</span>
									{/if}
								</TooltipContent>
							</Tooltip>
						</th>
						{@render valueCell(
							formatCores(row.cpu),
							'w-[5ch]',
							cn(GROUP_START, usageClass(row.cpu, row.cpuLimit))
						)}
						{@render specCell(
							formatCores(row.cpuRequest),
							share(row.cpuRequest, cpuAllocatable, row.node),
							'w-[5ch]',
							row.cpuRequest === 0
						)}
						{@render specCell(
							formatCores(row.cpuLimit),
							share(row.cpuLimit, cpuAllocatable, row.node),
							'w-[5ch]',
							row.cpuLimit === 0
						)}
						{@render valueCell(
							formatBytes(row.mem),
							'w-[7ch]',
							cn(GROUP_START, usageClass(row.mem, row.memLimit))
						)}
						{@render specCell(
							formatBytes(row.memRequest),
							share(row.memRequest, memAllocatable, row.node),
							'w-[7ch]',
							row.memRequest === 0
						)}
						{@render specCell(
							formatBytes(row.memLimit),
							share(row.memLimit, memAllocatable, row.node),
							'w-[7ch]',
							row.memLimit === 0
						)}
						{@render cardsCell(row)}
						<!-- Allocated and Usage come from HAMi, so a pod that bypassed the scheduler shows
						     its cards here and nothing else — the same fingerprint the node table draws. -->
						{@render valueCell(
							row.gpuAllocated > 0 ? formatBytes(row.gpuAllocated) : DASH,
							'w-[7ch]',
							''
						)}
						{@render valueCell(row.gpuUsed > 0 ? formatBytes(row.gpuUsed) : DASH, 'w-[7ch]', '')}
						{@render valueCell(
							row.gpuUtil !== null ? `${Math.round(row.gpuUtil)}%` : DASH,
							'w-[4ch]',
							''
						)}
						{@render valueCell(
							String(row.restarts),
							'w-[3ch]',
							cn(GROUP_START, restartClass(row.restarts))
						)}
						<!-- Only the number is padded: `formatDuration` returns a translated word, and a `ch`
						     slot sized for "Minute" would not hold every locale's. -->
						<td class={dataTable.cell}>
							<span class="inline-block w-[4ch] text-right">{age.value.toFixed(1)}</span>
							{age.unit}
						</td>
						{@render valueCell(formatRate(row.net), 'w-[8ch]', '')}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
{/snippet}

<WidgetCard
	title={m.pod_detail_table()}
	description={m.pod_detail_table_description()}
	info={m.pod_detail_table_tooltip()}
	status={snapshot.status}
	stale={snapshot.stale}
	class="min-w-0"
	bodyClass="min-h-50"
>
	{#snippet action()}
		{#if snapshot.status === 'ready'}
			<Sheet {open} onOpenChange={(details) => (open = details.open)}>
				<SheetTrigger>
					{#snippet asChild(props)}
						<Button
							{...props({ class: 'text-muted-foreground' })}
							variant="ghost"
							size="icon-sm"
							aria-label={m.expand()}
							title={m.expand()}
						>
							<Maximize2Icon aria-hidden="true" />
						</Button>
					{/snippet}
				</SheetTrigger>
				<SheetContent class="data-[side=right]:w-full data-[side=right]:sm:max-w-[min(96vw,96rem)]">
					<SheetHeader
						title={m.pod_detail_table()}
						description={m.pod_detail_table_description()}
						class="pe-12"
					/>
					<SheetBody class="px-4 pb-4">
						{@render table(false)}
					</SheetBody>
				</SheetContent>
			</Sheet>
		{/if}
	{/snippet}

	{#snippet skeleton()}
		<div class="flex flex-col gap-2" aria-hidden="true">
			<Skeleton class="h-16 w-full" />
			{#each { length: 3 }, i (i)}
				<Skeleton class="h-8 w-full" />
			{/each}
		</div>
	{/snippet}

	{@render table(rows.length > SCROLL_AFTER)}
</WidgetCard>

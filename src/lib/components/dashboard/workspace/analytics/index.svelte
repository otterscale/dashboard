<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, untrack } from 'svelte';

	import type { WidgetState } from '$lib/components/dashboard/kit';
	import { rangeLiteral, type Series } from '$lib/components/dashboard/kit/fetch';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import type { SharedMetrics } from '$lib/prometheus';

	import HistoryView from './history-view.svelte';
	import {
		fetchGpuCards,
		fetchPods,
		fetchRestartHistory,
		fetchUsageHistory,
		fetchVolumeHistory,
		fetchVolumes,
		type GpuCards,
		type PodFacts,
		type UsageHistory
	} from './lib/data';
	import {
		assignPods,
		entriesOf,
		entryLines,
		type HistoryLines,
		historyStep,
		historyTotals,
		inEntry,
		isLive,
		lineValues,
		podGpu,
		type PodNow,
		type RankMetric,
		restartBars,
		restartBucket,
		type Totals,
		totalsOf,
		type Volume,
		volumesOf,
		WORKSPACE_ID
	} from './lib/model';
	import { listWorkloads, type WorkspaceWorkloads } from './lib/workloads';
	import NowCards from './now-cards.svelte';
	import PodsTable from './pods-table.svelte';
	import SelectionHeading from './selection-heading.svelte';
	import WorkloadRanking from './workload-ranking.svelte';

	// The Analytics tab. Top to bottom: a ranking that is also the picker (the whole workspace
	// first, then each workload), then the picked row as it is now or over the chosen window.
	// Workloads and their pods come from the Resource API, as on the overview; CPU, memory, restarts
	// and volumes are per-pod Prometheus answers added up here. GPU is what the scheduler wrote on
	// each pod plus the server's shared per-card queries, which only answer for the present.
	let {
		client,
		shared,
		cluster,
		namespace,
		history,
		metric = $bindable(),
		selected = $bindable(),
		start,
		end,
		windowLabel,
		tick
	}: {
		client: PrometheusDriver;
		shared: SharedMetrics;
		cluster: string;
		namespace: string;
		history: boolean;
		metric: RankMetric;
		/** A row's id; undefined is the whole workspace. */
		selected: string | undefined;
		start: Date;
		end: Date;
		/** "the last 24 h", or the fixed span, for the History copy. */
		windowLabel: string;
		/** Bumped by the page's Auto update timer; Now cards refetch on it. */
		tick: number;
	} = $props();

	const transport = getContext<Transport>('transport');
	const resourceClient = createClient(ResourceService, transport);

	const workloads = new Loader<WorkspaceWorkloads>(async () => {
		try {
			return await listWorkloads(resourceClient, cluster, namespace);
		} catch (error) {
			console.error('Failed to list workspace workloads:', error);
			return null;
		}
	});

	// Now: one request per group of cards. History reuses `pods` for what is not a line: restarts
	// over the window, and the pods and quota as they are at its end.
	const pods = new Loader<PodFacts>(() =>
		history
			? fetchPods(client, namespace, rangeLiteral(start, end), end)
			: fetchPods(client, namespace, '24h')
	);
	const gpuCards = $derived(
		[...new Set([...(workloads.data?.gpu.values() ?? [])].flat().map((d) => d.uuid))].sort()
	);
	const gpu = new Loader<GpuCards>(() => fetchGpuCards(shared, gpuCards));
	const volumes = new Loader<Volume[]>(() =>
		fetchVolumes(client, namespace, history ? end : undefined)
	);

	const windowSeconds = $derived((end.getTime() - start.getTime()) / 1000);
	const step = $derived(historyStep(windowSeconds));
	const bucket = $derived(restartBucket(windowSeconds));
	const usageHistory = new Loader<UsageHistory>(() =>
		fetchUsageHistory(client, namespace, start, end, step)
	);
	const restartHistory = new Loader<Series[]>(() =>
		fetchRestartHistory(client, namespace, start, end, bucket)
	);
	const volumeHistory = new Loader<Series[]>(() =>
		fetchVolumeHistory(client, namespace, start, end, step)
	);

	const entries = $derived(entriesOf(namespace, workloads.data?.workloads ?? []));
	// A link to a workload that is gone shows the workspace, and the URL follows.
	function dropMissingSelection() {
		if (workloads.state !== 'ready' || selected === undefined) return;
		if (selected === WORKSPACE_ID || !entries.some((entry) => entry.id === selected)) {
			selected = undefined;
		}
	}

	// The cards to ask about come with the workloads, so GPU follows that answer.
	function loadNow() {
		workloads.load().then(() => {
			dropMissingSelection();
			gpu.load();
		});
		pods.load();
		volumes.load();
	}
	function loadHistory() {
		usageHistory.load();
		restartHistory.load();
		volumeHistory.load();
	}

	// What the cards are asked about: now, or one window. `pods` and `volumes` answer for both, so
	// when this changes every loader that depends on it goes back to loading; one mode's numbers
	// never sit under the other's labels. The workload list and the GPU cards are always the
	// present, and stay.
	const request = $derived(history ? `history:${start.getTime()}:${end.getTime()}` : 'now');
	let asked: string | undefined;
	$effect(() => {
		// Now refetches on every tick; a window is fetched once.
		void tick;
		const next = request;
		// Untracked: the fetchers read props and the loaders write their own state, and none of
		// that should re-run this effect.
		untrack(() => {
			const changed = next !== asked;
			if (changed && asked !== undefined) {
				for (const loader of [pods, volumes, usageHistory, restartHistory, volumeHistory]) {
					loader.reset();
				}
			}
			asked = next;
			if (!history) loadNow();
			else if (changed) {
				loadNow();
				loadHistory();
			}
		});
	});

	const entry = $derived(entries.find((e) => e.id === selected) ?? entries[0]);

	const podsNow = $derived<PodNow[]>(
		(pods.data?.pods ?? []).map((pod) => ({
			...pod,
			gpu: podGpu(
				workloads.data?.gpu.get(pod.pod) ?? [],
				gpu.data?.used ?? new Map(),
				gpu.data?.tenants ?? new Map(),
				gpu.data?.util ?? new Map()
			)
		}))
	);
	const quota = $derived(pods.data?.quota ?? {});

	// History's series name pods that are gone, too; each still belongs to its workload.
	const owner = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass
		const names = new Set(podsNow.map((pod) => pod.pod));
		for (const volume of volumes.data ?? []) volume.pods.forEach((pod) => names.add(pod));
		if (history) {
			for (const list of [...Object.values(usageHistory.data ?? {}), restartHistory.data ?? []]) {
				for (const s of list) if (s.labels.pod) names.add(s.labels.pod);
			}
		}
		return assignPods(names, entries);
	});

	const nowRows = $derived(
		entries.map((e) => ({
			entry: e,
			totals: totalsOf(podsNow.filter((pod) => inEntry(e.id, pod.pod, owner)))
		}))
	);

	const linesByEntry = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass
		const out = new Map<string, HistoryLines>();
		if (!history) return out;
		const series = {
			...(usageHistory.data ?? {}),
			restarts: restartHistory.data ?? []
		};
		for (const e of entries) out.set(e.id, entryLines(e.id, series, owner));
		return out;
	});
	const rows = $derived<{ entry: (typeof entries)[number]; totals: Totals }[]>(
		history
			? nowRows.map((row) => ({
					entry: row.entry,
					totals: historyTotals(linesByEntry.get(row.entry.id) ?? {}, row.totals)
				}))
			: nowRows
	);
	// GPU has no line over time, so its tab has no trend.
	const TREND_KEY = {
		cpu: 'cpuUse',
		memory: 'memUse',
		gpu: undefined,
		restarts: 'restarts'
	} as const;
	const trends = $derived.by(() => {
		const key = TREND_KEY[metric];
		return new Map([...linesByEntry].map(([id, lines]) => [id, key ? lineValues(lines[key]) : []]));
	});

	const selectedRow = $derived(rows.find((row) => row.entry.id === entry.id));
	const selectedPods = $derived(
		podsNow.filter(
			(pod) => inEntry(entry.id, pod.pod, owner) && (isLive(pod) || pod.phase === 'Failed')
		)
	);
	const selectedVolumes = $derived(volumesOf(entry.id, volumes.data ?? [], owner));
	const selectedLines = $derived(linesByEntry.get(entry.id) ?? {});

	const bars = $derived(
		restartBars(selectedLines.restarts ?? new Map(), start.getTime(), end.getTime(), bucket)
	);
	const volumeSeries = $derived.by(() => {
		const names = new Set(selectedVolumes.map((volume) => volume.name));
		return (volumeHistory.data ?? []).filter(
			(s) => entry.id === WORKSPACE_ID || names.has(s.labels.persistentvolumeclaim)
		);
	});

	function worst(...states: WidgetState[]): WidgetState {
		if (states.includes('error')) return 'error';
		if (states.includes('loading')) return 'loading';
		return 'ready';
	}
	// Without the workload list there are no rows to rank; without pods there are no numbers.
	const rankingState = $derived(
		worst(
			workloads.state,
			pods.state,
			metric === 'gpu' ? gpu.state : 'ready',
			history && metric !== 'gpu' ? usageHistory.state : 'ready'
		)
	);
	const gpuCardState = $derived(worst(pods.state, gpu.state));
	// A volume is a workload's through the pods that mount it, so that card needs the workloads.
	const volumesState = $derived(worst(volumes.state, workloads.state));
</script>

<div class="flex flex-col gap-2 @md:gap-3">
	<WorkloadRanking
		{rows}
		bind:metric
		{quota}
		state={rankingState}
		selected={entry.id}
		onSelect={(id) => (selected = id === WORKSPACE_ID ? undefined : id)}
		{history}
		{windowLabel}
		{trends}
	/>
	<SelectionHeading
		{entry}
		totals={selectedRow?.totals}
		workloads={entries.filter((e) => e.id !== WORKSPACE_ID)}
		{quota}
		{namespace}
		loading={worst(workloads.state, pods.state) === 'loading'}
	/>
	{#if history}
		<HistoryView
			wholeWorkspace={entry.id === WORKSPACE_ID}
			lines={selectedLines}
			totals={selectedRow?.totals}
			{quota}
			restartBars={bars}
			bucketSeconds={bucket}
			volumes={volumeSeries}
			{windowLabel}
			usageState={worst(usageHistory.state, workloads.state)}
			gpuState={worst(gpuCardState, workloads.state)}
			restartsState={worst(restartHistory.state, workloads.state)}
			volumesState={worst(volumeHistory.state, volumesState)}
			podsState={worst(pods.state, workloads.state)}
		/>
	{:else}
		<NowCards
			{entry}
			totals={selectedRow?.totals}
			{rows}
			pods={selectedPods}
			{quota}
			volumes={selectedVolumes}
			podsState={worst(pods.state, workloads.state)}
			gpuState={worst(gpuCardState, workloads.state)}
			{volumesState}
		/>
		<PodsTable
			pods={selectedPods}
			{namespace}
			wholeWorkspace={entry.id === WORKSPACE_ID}
			state={worst(pods.state, workloads.state)}
		/>
	{/if}
</div>

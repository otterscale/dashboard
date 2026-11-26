<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { CommitBars, NUM, Panel, widgetState } from '$lib/components/dashboard/kit';
	import { CAPACITY_THRESHOLDS } from '$lib/components/dashboard/kit/format';
	import { m } from '$lib/messages';
	import {
		DCGM_GPU_MEMORY_TOTAL_BYTES,
		DCGM_GPU_MEMORY_USED_BYTES,
		fetchCombinedInstantOrNull
	} from '$lib/prometheus';

	import ScopeLabel from './scope-label.svelte';
	import { READY_NODES } from './signals.svelte';

	let {
		prometheusDriver,
		isReloading = $bindable(),
		readyOnly = false
	}: {
		prometheusDriver: PrometheusDriver;
		isReloading: boolean;
		/** Count GPUs on Ready nodes only: set while some node is not Ready (SPEC 3.4). */
		readyOnly?: boolean;
	} = $props();

	// Cards DCGM reports, deduped by UUID: a second dcgm-exporter scrape would double them.
	let cardCount = $state<number>();
	// Booked by the HAMi scheduler, by memory — HAMi shares a card by memory, so this is the
	// fraction of the pool handed out. Undefined on clusters without the vGPU stack.
	let allocatedPct = $state<number>();
	// Measured on the card by DCGM — the numbers a workload cannot hide from.
	let usedPct = $state<number>();
	// Shares the 0–100 scale with the memory ratios but answers a different question, so it is
	// left uncoloured.
	let utilizationPct = $state<number>();
	let failed = $state(false);

	// DCGM's `hostname` is the node name. Scoped, a card on a node that is not Ready drops out.
	function dcgm(expr: string): string {
		return readyOnly
			? `(${expr}) and on (hostname) label_replace(${READY_NODES}, "hostname", "$1", "node", "(.*)")`
			: expr;
	}

	// Both memory ratios share the DCGM physical total so the bars are comparable. HAMi's
	// booking is counted only for cards DCGM reports, so a card on a lost node cannot inflate it.
	// No `or vector(0)` on the booking: an absent sum means HAMi is not deployed, and a
	// substituted 0 would read as "0% allocated" on a cluster that simply has no HAMi.
	async function fetch() {
		const total = `sum(${dcgm(DCGM_GPU_MEMORY_TOTAL_BYTES)})`;
		const r = await fetchCombinedInstantOrNull(prometheusDriver, {
			cardCount: `count(count by (UUID) (${dcgm('DCGM_FI_DEV_FB_USED')}))`,
			allocatedPct: `100 * sum(sum by (device_uuid) (hami_gpu_memory_allocated_bytes) and on (device_uuid) label_replace(${dcgm('DCGM_FI_DEV_FB_USED')}, "device_uuid", "$1", "UUID", "(.*)")) / ${total}`,
			usedPct: `100 * sum(${dcgm(DCGM_GPU_MEMORY_USED_BYTES)}) / ${total}`,
			utilizationPct: `avg(${dcgm('DCGM_FI_DEV_GPU_UTIL')})`
		});
		failed = r === null;
		if (!r) return;
		const pick = (key: string) => {
			const value = r[key][0]?.value?.value;
			return value === undefined ? undefined : Number(value);
		};
		cardCount = pick('cardCount');
		allocatedPct = pick('allocatedPct');
		usedPct = pick('usedPct');
		utilizationPct = pick('utilizationPct');
	}

	const reloadManager = new ReloadManager(fetch);

	$effect(() => {
		if (isReloading) {
			reloadManager.restart();
		} else {
			reloadManager.stop();
		}
	});

	// The scope changes when a node drops out or comes back; fetch again at once.
	let lastScope: boolean | undefined;
	$effect(() => {
		const scope = readyOnly;
		if (lastScope !== undefined && lastScope !== scope) void fetch();
		lastScope = scope;
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});
</script>

<!-- Gate on the card count: it exists whenever DCGM sees a card, so an idle cluster still
     renders 0% instead of an empty state. -->
<Panel
	title={m.gpu()}
	tooltip={m.cluster_dashboard_gpu_memory_tooltip()}
	state={widgetState(isLoaded, cardCount !== undefined, failed && cardCount === undefined)}
	class="min-h-58"
>
	{#snippet actions()}
		<ScopeLabel {readyOnly} />
	{/snippet}
	<p class="text-[1.75rem] leading-8 tracking-tight {NUM}">
		{cardCount ?? '—'}<span class="ml-1.5 text-sm tracking-normal text-muted-foreground"
			>{m.cluster_gpus()}</span
		>
	</p>
	<!-- Utilization is uncoloured: a busy GPU is the goal, so the pressure thresholds don't apply. -->
	<CommitBars
		class="mt-auto pt-3"
		tickLabel={m.total()}
		thresholds={CAPACITY_THRESHOLDS}
		summary={false}
		rows={[
			...(allocatedPct === undefined ? [] : [{ label: m.gpu_allocated(), value: allocatedPct }]),
			{ label: m.cluster_gpu_memory(), value: usedPct },
			{ label: m.utilization(), value: utilizationPct, colored: false }
		]}
	/>
</Panel>

<script lang="ts">
	import BoxIcon from '@lucide/svelte/icons/box';
	import CpuIcon from '@lucide/svelte/icons/cpu';
	import MemoryStickIcon from '@lucide/svelte/icons/memory-stick';
	import RotateCcwIcon from '@lucide/svelte/icons/rotate-ccw';
	import { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card/index.js';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral, fetchCombinedInstant } from '$lib/prometheus';

	import KpiCard from '../kpi-card.svelte';

	// Resource-consumption headline. Defaults to the whole cluster; when a namespace is
	// selected the values scope to it.
	let {
		client,
		namespace,
		isReloading = $bindable()
	}: { client: PrometheusDriver; namespace: string | undefined; isReloading?: boolean } = $props();

	let podsRunning = $state<number | null>(null);
	let cpuCores = $state<number | null>(null);
	let memBytes = $state<number | null>(null);
	let restarts1h = $state<number | null>(null);
	let isLoaded = $state(false);

	// '' for the cluster-wide default, otherwise a `namespace="…"` selector fragment.
	const nsSel = $derived.by(() => {
		const ns = (namespace ?? '').trim();
		return ns && ns !== '.*' ? `namespace="${escapePromqlStringLiteral(ns)}"` : '';
	});

	// All four scalars come back in a single `or`-unioned instant query.
	async function fetch() {
		const sel = nsSel;
		const and = sel ? `,${sel}` : '';
		try {
			const r = await fetchCombinedInstant(client, {
				running: `sum(kube_pod_status_phase{phase="Running"${and}})`,
				cpu: `sum(rate(container_cpu_usage_seconds_total{container!=""${and}}[2m]))`,
				memory: `sum(container_memory_working_set_bytes{container!=""${and}})`,
				restarts: `sum(increase(kube_pod_container_status_restarts_total{${sel}}[1h]))`
			});
			podsRunning = r.running[0]?.value?.value ?? null;
			cpuCores = r.cpu[0]?.value?.value ?? null;
			memBytes = r.memory[0]?.value?.value ?? null;
			restarts1h = r.restarts[0]?.value?.value ?? null;
		} catch (error) {
			console.error('Failed to fetch workload summary:', error);
		}
	}

	const reloadManager = new ReloadManager(fetch);
	$effect(() => {
		if (isReloading) reloadManager.restart();
		else reloadManager.stop();
	});
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => reloadManager.stop());

	const mem = $derived(formatCapacity(Number(memBytes ?? 0)));
</script>

<div class="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-4">
	<KpiCard
		title={m.pods()}
		description={m.workload_kpi_pods_description()}
		tooltip={m.workload_kpi_pods_tooltip()}
		icon={BoxIcon}
		{isLoaded}
		isEmpty={podsRunning === null}
	>
		<Card.Content class="mt-1 flex flex-col gap-1">
			<p class="text-3xl font-bold">{Math.round(Number(podsRunning ?? 0))}</p>
		</Card.Content>
	</KpiCard>

	<KpiCard
		title={m.workload_kpi_restarts()}
		description={m.workload_kpi_restarts_description()}
		tooltip={m.workload_kpi_restarts_tooltip()}
		icon={RotateCcwIcon}
		{isLoaded}
		isEmpty={restarts1h === null}
	>
		<Card.Content class="mt-1 flex flex-col gap-1">
			<p class="text-3xl font-bold {Number(restarts1h) > 0 ? 'text-chart-1' : ''}">
				{Math.round(Number(restarts1h ?? 0))}
			</p>
		</Card.Content>
	</KpiCard>

	<KpiCard
		title={m.cpu()}
		description={m.workload_kpi_cpu_description()}
		tooltip={m.workload_kpi_cpu_tooltip()}
		icon={CpuIcon}
		{isLoaded}
		isEmpty={cpuCores === null}
	>
		<Card.Content class="mt-1 flex flex-col gap-1">
			<p class="text-3xl font-bold">{Number(cpuCores ?? 0).toFixed(1)}</p>
		</Card.Content>
	</KpiCard>

	<KpiCard
		title={m.memory()}
		description={m.workload_kpi_memory_description()}
		tooltip={m.workload_kpi_memory_tooltip()}
		icon={MemoryStickIcon}
		{isLoaded}
		isEmpty={memBytes === null}
	>
		<Card.Content class="mt-1 flex flex-col gap-1">
			<p class="text-3xl font-bold">{mem.value} {mem.unit}</p>
		</Card.Content>
	</KpiCard>
</div>

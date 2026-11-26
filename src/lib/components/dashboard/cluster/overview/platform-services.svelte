<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { NUM, Panel, Status, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { fetchCombinedInstantOrNull, LIVE_PODS } from '$lib/prometheus';
	import { cn } from '$lib/utils';

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

	// Where each service runs, from the otterscale and otterscale-prometheus charts: the
	// `otterscale` release in otterscale-system (server, dashboard, keycloakx, harbor) and
	// kube-prometheus-stack in monitoring. `anchor` picks the pod whose node is shown when a
	// service has several. Checked against the charts, not yet against a live cluster.
	const SERVICES = [
		{
			name: 'otterscale',
			namespace: 'otterscale-system',
			pods: /^otterscale-(server|dashboard)-/,
			anchor: /^otterscale-server-/
		},
		{ name: 'Keycloak', namespace: 'otterscale-system', pods: /^otterscale-keycloak-\d+$/ },
		{
			name: 'Harbor',
			namespace: 'otterscale-system',
			pods: /^otterscale-harbor-/,
			anchor: /^otterscale-harbor-core-/
		},
		// The Prometheus CR's StatefulSet; alertmanager, the operator and the exporters are not it.
		{ name: 'Prometheus', namespace: 'monitoring', pods: /^prometheus-.+-\d+$/ }
	];
	const NAMESPACES = 'otterscale-system|monitoring';

	type PodFacts = {
		namespace: string;
		pod: string;
		ready: boolean;
		node?: string;
		restarts: number;
	};
	// Replaced whole by each fetch.
	let pods = $state.raw<PodFacts[]>([]);
	let failed = $state(false);

	async function fetch() {
		const r = await fetchCombinedInstantOrNull(prometheusDriver, {
			// Live pods only: the charts' finished hook jobs would otherwise read as not ready.
			ready: `max by (namespace, pod) (kube_pod_status_ready{namespace=~"${NAMESPACES}", condition="true"} ${LIVE_PODS})`,
			node: `max by (namespace, pod, node) (kube_pod_info{namespace=~"${NAMESPACES}"})`,
			restarts: `sum by (namespace, pod) (increase(kube_pod_container_status_restarts_total{namespace=~"${NAMESPACES}"}[24h]))`
		});
		failed = r === null;
		if (!r) return;
		const key = (labels: Record<string, string>) => `${labels.namespace}/${labels.pod}`;
		const nodes: Record<string, string> = {};
		for (const series of r.node) {
			const labels = series.metric.labels as Record<string, string>;
			if (labels.node) nodes[key(labels)] = labels.node;
		}
		const restarts: Record<string, number> = {};
		for (const series of r.restarts) {
			const value = Number(series.value?.value);
			if (Number.isFinite(value))
				restarts[key(series.metric.labels as Record<string, string>)] = value;
		}
		pods = r.ready.map((series) => {
			const labels = series.metric.labels as Record<string, string>;
			return {
				namespace: labels.namespace,
				pod: labels.pod,
				ready: Number(series.value?.value) === 1,
				node: nodes[key(labels)],
				restarts: restarts[key(labels)] ?? 0
			};
		});
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

	const ROW_GRID = 'grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-3';

	type Row = {
		name: string;
		node?: string;
		status: 'ready' | 'not-ready' | 'unknown' | 'absent';
		restarts: number;
	};

	const rows = $derived<Row[]>(
		SERVICES.map((service) => {
			const own = pods.filter(
				(pod) => pod.namespace === service.namespace && service.pods.test(pod.pod)
			);
			const anchor = (service.anchor && own.find((pod) => service.anchor!.test(pod.pod))) || own[0];
			const node = anchor?.node;
			const restarts = Math.round(own.reduce((sum, pod) => sum + pod.restarts, 0));
			if (own.length === 0) return { name: service.name, status: 'absent', restarts };
			// A pod on a node that stopped reporting still reads Ready; say we cannot tell.
			if (node && signals.isNodeReady(node) === false) {
				return { name: service.name, node, status: 'unknown', restarts };
			}
			return {
				name: service.name,
				node,
				status: own.every((pod) => pod.ready) ? 'ready' : 'not-ready',
				restarts
			};
		})
	);

	const installed = $derived(rows.filter((row) => row.status !== 'absent'));
	const readyCount = $derived(installed.filter((row) => row.status === 'ready').length);
	const notReadyCount = $derived(installed.filter((row) => row.status === 'not-ready').length);
	const restartTotal = $derived(installed.reduce((sum, row) => sum + row.restarts, 0));
</script>

<Panel
	title={m.platform_services()}
	tooltip={m.platform_services_tooltip()}
	state={widgetState(isLoaded, installed.length > 0, failed && installed.length === 0)}
	class="min-h-83"
>
	<div class="flex flex-wrap gap-x-10 gap-y-3">
		<div class="min-w-0">
			<p class="text-xs leading-4 text-muted-foreground">{m.services_ready()}</p>
			<div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
				<span class={cn('text-2xl leading-8 tracking-tight whitespace-nowrap', NUM)}>
					{readyCount} / {installed.length}
				</span>
				{#if readyCount === installed.length}
					<Status tone="ok" variant="pill">{m.all_ready()}</Status>
				{:else if notReadyCount > 0}
					<Status tone="bad" variant="pill">{notReadyCount} {m.cluster_not_ready()}</Status>
				{:else}
					<!-- What is left is on a node that stopped reporting: not known to be down. -->
					<Status tone="warn" variant="pill"
						>{installed.length - readyCount} {m.cluster_unknown()}</Status
					>
				{/if}
			</div>
		</div>
		<div class="min-w-0">
			<p class="text-xs leading-4 text-muted-foreground">{m.restarts_24h()}</p>
			<div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
				<span class={cn('text-2xl leading-8 tracking-tight', NUM)}>{restartTotal}</span>
				{#if restartTotal === 0}
					<Status tone="ok" variant="pill">{m.restarts_stable()}</Status>
				{/if}
			</div>
		</div>
	</div>
	<!-- Rows share whatever height the card has, so it lines up with the card beside it. -->
	<div class="mt-4 flex flex-1 flex-col text-sm">
		<div class={cn(ROW_GRID, 'border-b pb-2 text-xs leading-4 text-muted-foreground')}>
			<span>{m.service()}</span>
			<span>{m.running_on()}</span>
			<span>{m.status()}</span>
		</div>
		{#each rows as row (row.name)}
			<div class={cn(ROW_GRID, 'min-h-10 flex-1 items-center border-b last:border-b-0')}>
				<span class="truncate font-[550]">{row.name}</span>
				<span
					class={cn('truncate font-mono text-[0.8125rem]', !row.node && 'text-muted-foreground')}
					title={row.node}
				>
					{row.node ?? '—'}
				</span>
				<span>
					{#if row.status === 'ready'}
						<Status tone="ok" variant="dot">{m.ready()}</Status>
					{:else if row.status === 'not-ready'}
						<Status tone="bad" variant="dot">{m.cluster_not_ready()}</Status>
					{:else if row.status === 'unknown'}
						<Status tone="warn" variant="dot">{m.cluster_unknown()}</Status>
					{:else}
						<span class="text-xs text-muted-foreground">{m.cluster_not_installed()}</span>
					{/if}
				</span>
			</div>
		{/each}
	</div>
</Panel>

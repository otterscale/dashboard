<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onDestroy, onMount } from 'svelte';

	import { page } from '$app/state';
	import { ReloadManager } from '$lib/components/custom/reloader';
	import { NUM, Panel, Status, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { fetchCombinedInstantOrNull } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { type EntryPoint, type EntryPointId, EntryPointsSource } from './entry-points.svelte';
	import type { ClusterSignals } from './signals.svelte';

	// etcd and the API server from their static pods (Prometheus), and the entry points from the
	// Kubernetes API, which only admins can read. HTTPRoutes are left out: almost always all
	// accepted, and a route without a ready backend is often a model scaled to zero.
	let {
		prometheusDriver,
		isReloading = $bindable(),
		signals
	}: {
		prometheusDriver: PrometheusDriver;
		isReloading: boolean;
		signals: ClusterSignals;
	} = $props();

	type Members = { ready: number; total: number };
	let etcd = $state<Members>();
	let apiServers = $state<Members>();
	let failed = $state(false);

	// RKE2 runs both as static pods named `<component>-<node>` in kube-system.
	const readyOf = (prefix: string) =>
		`max by (pod) (kube_pod_status_ready{namespace="kube-system", pod=~"${prefix}-.+", condition="true"})`;

	function members(series: { value?: { value?: unknown } }[]): Members | undefined {
		if (series.length === 0) return undefined;
		return {
			ready: series.filter((s) => Number(s.value?.value) === 1).length,
			total: series.length
		};
	}

	async function fetch() {
		const r = await fetchCombinedInstantOrNull(prometheusDriver, {
			etcd: readyOf('etcd'),
			apiServers: readyOf('kube-apiserver')
		});
		failed = r === null;
		if (!r) return;
		etcd = members(r.etcd);
		apiServers = members(r.apiServers);
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

	const entrySource = new EntryPointsSource(
		createClient(ResourceService, getContext<Transport>('transport')),
		page.params.cluster ?? '',
		(node) => signals.isNodeReady(node)
	);
	$effect(() => {
		if (isReloading) entrySource.start();
		else entrySource.stop();
		return () => entrySource.stop();
	});
	onMount(() => {
		if (!isReloading) void entrySource.refresh();
	});
	const entryPoints = $derived(entrySource.entryPoints);

	const ENTRY_GRID =
		'grid grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)] gap-3';
	const ENTRY_NAMES: Record<EntryPointId, () => string> = {
		'control-plane-vip': m.entry_control_plane_vip,
		'hci-ingress': m.entry_hci_ingress,
		'inference-ingress': m.entry_inference_ingress
	};

	// Failover needs a second master; with one (a single node included) losing it stops the cluster.
	const singleNode = $derived(signals.nodes.length === 1);
	const singleMaster = $derived(singleNode || signals.masterCount === 1);
	const hasData = $derived(etcd !== undefined || apiServers !== undefined);
</script>

{#snippet figure(label: string, value: Members | undefined, kind: 'etcd' | 'api')}
	<div class="min-w-0">
		<p class="truncate text-xs leading-4 text-muted-foreground">{label}</p>
		<div class="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
			<span class="text-2xl leading-8 tracking-tight whitespace-nowrap {NUM}">
				{value ? `${value.ready} / ${value.total}` : '—'}
			</span>
			{#if value}
				{@const down = value.total - value.ready}
				{#if down === 0 && kind === 'etcd' && singleMaster}
					<!-- One member holds its own quorum, but losing it stops the cluster: say that. -->
					<Status tone="muted" variant="pill">{m.no_failover()}</Status>
				{:else if down === 0}
					<Status tone="ok" variant="pill">{kind === 'etcd' ? m.quorum_held() : m.ready()}</Status>
				{:else if kind === 'etcd' && value.ready < Math.floor(value.total / 2) + 1}
					<Status tone="bad" variant="pill">{m.quorum_lost()}</Status>
				{:else if kind === 'api' && value.ready === 0}
					<Status tone="bad" variant="pill">{m.cluster_not_ready()}</Status>
				{:else}
					<Status tone="warn" variant="pill">{m.members_down({ count: String(down) })}</Status>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet entryStatus(entry: EntryPoint)}
	{#if entry.state === 'active'}
		<Status tone="ok" variant="dot">{m.entry_active()}</Status>
	{:else if entry.state === 'not-ready'}
		<Status tone="bad" variant="dot">{m.cluster_not_ready()}</Status>
	{:else if entry.state === 'unannounced'}
		<Status tone="bad" variant="dot">{m.entry_unannounced()}</Status>
	{:else if entry.state === 'no-gateway'}
		<Status tone="bad" variant="dot">{m.entry_no_gateway()}</Status>
	{:else}
		<!-- The node holding it stopped reporting: whether it still answers is not known. -->
		<Status tone="warn" variant="dot">{m.cluster_unknown()}</Status>
	{/if}
{/snippet}

<Panel
	title={entryPoints ? m.control_plane_and_entry_points() : m.control_plane()}
	tooltip={entryPoints ? m.entry_points_tooltip() : m.control_plane_tooltip()}
	state={widgetState(isLoaded, hasData, failed && !hasData)}
	class="min-h-40 @5xl:min-h-83"
>
	<!-- The same two figures at any size, so the card lines up with Platform services beside it.
	     A single master shows "No failover" on etcd instead of "Quorum held". -->
	<div class="grid grid-cols-2 gap-4 @md/panel:flex @md/panel:gap-10">
		{@render figure(m.etcd_members(), etcd, 'etcd')}
		{@render figure(m.kubernetes_api_servers(), apiServers, 'api')}
	</div>
	{#if entryPoints}
		<!-- Rows share whatever height the card has, like the platform services table beside it. -->
		<div class="mt-4 hidden flex-1 flex-col text-sm @lg/panel:flex">
			<div class="{ENTRY_GRID} border-b pb-2 text-xs leading-4 text-muted-foreground">
				<span>{m.entry_point()}</span>
				<span>{m.entry_address()}</span>
				<span>{m.entry_active_on()}</span>
				<span>{m.status()}</span>
			</div>
			{#each entryPoints as entry (entry.id)}
				<div class="{ENTRY_GRID} min-h-10 flex-1 items-center border-b last:border-b-0">
					<span class="truncate font-[550]" title={entry.gateway}>{ENTRY_NAMES[entry.id]()}</span>
					<span
						class={cn(
							'truncate font-mono text-[0.8125rem]',
							!entry.address && 'text-muted-foreground'
						)}
					>
						{entry.address ?? '—'}
					</span>
					<span
						class={cn(
							'truncate font-mono text-[0.8125rem]',
							!entry.activeOn && 'text-muted-foreground'
						)}
						title={entry.activeOn}
					>
						{entry.activeOn ?? '—'}
					</span>
					<span>{@render entryStatus(entry)}</span>
				</div>
			{/each}
		</div>
		<!-- Narrow cards: four columns would truncate every address, so each entry takes two lines. -->
		<ul class="mt-4 text-sm @lg/panel:hidden">
			{#each entryPoints as entry (entry.id)}
				<li class="border-b py-2.5 first:border-t last:border-b-0">
					<div class="flex items-center justify-between gap-3">
						<span class="truncate font-[550]" title={entry.gateway}>{ENTRY_NAMES[entry.id]()}</span>
						{@render entryStatus(entry)}
					</div>
					<p class="mt-0.5 truncate font-mono text-[0.8125rem] text-muted-foreground">
						{entry.address ?? '—'}{#if entry.activeOn}{` · ${entry.activeOn}`}{/if}
					</p>
				</li>
			{/each}
		</ul>
	{/if}
</Panel>

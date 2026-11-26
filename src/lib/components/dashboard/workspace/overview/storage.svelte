<script lang="ts">
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Panel, Status, widgetState } from '$lib/components/dashboard/kit';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, type SharedMetrics } from '$lib/prometheus';

	let {
		prometheusDriver,
		namespace,
		shared,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		shared: SharedMetrics;
		isReloading: boolean;
	} = $props();

	let requestedBytes: SampleValue | undefined = $state(undefined);
	let usedBytes: SampleValue | undefined = $state(undefined);
	let clusterTotalBytes: SampleValue | undefined = $state(undefined);
	let totalCount: SampleValue | undefined = $state(undefined);
	let boundCount: SampleValue | undefined = $state(undefined);
	let pendingCount: SampleValue | undefined = $state(undefined);

	function scalar(v: SampleValue | undefined): number | undefined {
		if (v?.value === undefined || v?.value === null) return undefined;
		const n = Number(v.value);
		return Number.isFinite(n) ? n : undefined;
	}

	async function fetchStorage() {
		const ns = escapePromqlStringLiteral(namespace);
		const evalAt = new Date();
		const [reqRes, usedRes, clusterTotalRes, totalRes, boundRes, pendingRes] = await Promise.all([
			prometheusDriver.instantQuery(
				`sum(kube_persistentvolumeclaim_resource_requests_storage_bytes{namespace="${ns}"}) or vector(0)`,
				evalAt
			),
			prometheusDriver.instantQuery(
				`sum(kubelet_volume_stats_used_bytes{namespace="${ns}"}) or vector(0)`,
				evalAt
			),
			// The cluster's capacity, to say when requests exceed it. Best effort:
			// without it the card still shows the Workspace's own numbers.
			shared.instant('ceph-total-bytes', undefined, evalAt).catch((error) => {
				console.warn('Failed to fetch cluster storage capacity:', error);
				return undefined;
			}),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_info{namespace="${ns}"}) or vector(0)`,
				evalAt
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Bound"} == 1) or vector(0)`,
				evalAt
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Pending"} == 1) or vector(0)`,
				evalAt
			)
		]);
		requestedBytes = reqRes.result[0]?.value;
		usedBytes = usedRes.result[0]?.value;
		clusterTotalBytes = clusterTotalRes?.result[0]?.value;
		totalCount = totalRes.result[0]?.value;
		boundCount = boundRes.result[0]?.value;
		pendingCount = pendingRes.result[0]?.value;
	}

	async function fetch() {
		try {
			if (!namespace) return;
			await fetchStorage();
		} catch (error) {
			console.error('Failed to fetch workspace storage metrics:', error);
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

	const provisioned = $derived(formatCapacity(scalar(requestedBytes) ?? 0));
	const used = $derived(formatCapacity(scalar(usedBytes) ?? 0));
	const clusterTotal = $derived(scalar(clusterTotalBytes) ?? 0);
	const clusterCapacity = $derived(formatCapacity(clusterTotal));
	// Thin provisioning lets PVC requests exceed the physical pool; flag that case.
	const overProvisioned = $derived(
		clusterTotal > 0 && (scalar(requestedBytes) ?? 0) > clusterTotal
	);
	const total = $derived(scalar(totalCount) ?? 0);
	const bound = $derived(scalar(boundCount) ?? 0);
	const pending = $derived(scalar(pendingCount) ?? 0);

	// PVCs that are neither bound nor pending (lost, or released), so the bar still adds up.
</script>

<Panel
	title={m.workspace_storage_title()}
	description={m.workspace_storage_description()}
	state={namespace ? widgetState(isLoaded, requestedBytes !== undefined) : 'ready'}
	class="min-h-[16.375rem] @md:min-h-[16.625rem]"
>
	{#if !namespace}
		<p class="text-sm text-muted-foreground">{m.workspace_namespace_unresolved()}</p>
	{:else}
		<!-- Two equal halves split at the middle, each centred, like the workload card beside it,
		     so the two dividers line up. -->
		<div class="flex flex-1 flex-col slashed-zero tabular-nums">
			<div class="flex flex-1 flex-col justify-center pb-2.5">
				<div class="grid grid-cols-2 gap-3">
					<div class="min-w-0">
						<p class="text-xs leading-4 text-muted-foreground">{m.workspace_pvc_provisioned()}</p>
						<p class="truncate text-[1.75rem] leading-8 tracking-tight">
							{provisioned.value}<span class="ml-1 text-sm tracking-normal text-muted-foreground"
								>{provisioned.unit}</span
							>
						</p>
					</div>
					<div class="min-w-0">
						<p class="text-xs leading-4 text-muted-foreground">{m.workspace_pvc_used()}</p>
						<p class="truncate text-[1.75rem] leading-8 tracking-tight">
							{used.value}<span class="ml-1 text-sm tracking-normal text-muted-foreground"
								>{used.unit}</span
							>
						</p>
						<p class="truncate text-[11px] leading-4 text-muted-foreground">
							{m.workspace_pvc_used_hint()}
						</p>
					</div>
				</div>
				{#if overProvisioned}
					<Status tone="warn" variant="dot" class="mt-2 items-start whitespace-normal">
						{m.workspace_pvc_exceeds_cluster({
							capacity: `${clusterCapacity.value} ${clusterCapacity.unit}`
						})}
					</Status>
				{/if}
			</div>
			<!-- PVC counts as plain numbers, like every other reading on this card. -->
			<dl class="grid flex-1 grid-cols-3 content-center gap-3 border-t border-border pt-2.5">
				<div class="min-w-0">
					<dt class="truncate text-xs leading-4 text-muted-foreground">
						{m.workspace_pvc_total_count()}
					</dt>
					<dd class="text-xl leading-7 {total === 0 ? 'text-muted-foreground' : ''}">{total}</dd>
				</div>
				<div class="min-w-0">
					<dt class="truncate text-xs leading-4 text-muted-foreground">
						{m.workspace_pvc_bound_count()}
					</dt>
					<dd class="text-xl leading-7 {bound === 0 ? 'text-muted-foreground' : 'text-chart-2'}">
						{bound}
					</dd>
				</div>
				<div class="min-w-0">
					<dt class="truncate text-xs leading-4 text-muted-foreground">
						{m.workspace_pvc_pending()}
					</dt>
					<dd class="text-xl leading-7">
						{#if pending > 0}
							<Status tone="warn" variant="dot" class="text-xl leading-7">{pending}</Status>
						{:else}
							<span class="text-muted-foreground">0</span>
						{/if}
					</dd>
				</div>
			</dl>
		</div>
	{/if}
</Panel>

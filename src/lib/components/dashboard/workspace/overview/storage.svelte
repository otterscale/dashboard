<script lang="ts">
	import TriangleAlert from '@lucide/svelte/icons/triangle-alert';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import Meter from '$lib/components/dashboard/shared/meter.svelte';
	import { problemTone, toneFill, usageTone } from '$lib/components/dashboard/shared/tone';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { Status } from '$lib/components/shadcnio/status';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral, type SharedMetrics } from '$lib/prometheus';
	import { cn } from '$lib/utils';

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

	const usedPercent = $derived.by(() => {
		const requested = scalar(requestedBytes) ?? 0;
		return requested > 0
			? Math.min(100, Math.round((100 * (scalar(usedBytes) ?? 0)) / requested))
			: 0;
	});
	const boundPercent = $derived(total > 0 ? Math.min(100, Math.round((100 * bound) / total)) : 0);
</script>

<WidgetCard
	title={m.workspace_storage_title()}
	description={m.workspace_storage_description()}
	state={!namespace ? 'message' : !isLoaded ? 'loading' : 'ready'}
	message={m.workspace_namespace_unresolved()}
	contentClass="flex flex-col gap-4"
>
	<div class="grid grid-cols-2 gap-4">
		<div class="min-w-0 space-y-0.5">
			<p class="text-xs text-muted-foreground">{m.workspace_pvc_used()}</p>
			<p class="text-2xl leading-8 font-semibold tracking-tight tabular-nums">
				{used.value}
				<span class="text-base font-medium text-muted-foreground">{used.unit}</span>
			</p>
		</div>
		<div class="min-w-0 space-y-0.5">
			<p class="text-xs text-muted-foreground">{m.workspace_pvc_provisioned()}</p>
			<p
				class={cn(
					'text-2xl leading-8 font-semibold tracking-tight tabular-nums',
					overProvisioned && 'text-warning'
				)}
			>
				{provisioned.value}
				<span class="text-base font-medium text-muted-foreground">{provisioned.unit}</span>
			</p>
		</div>
	</div>
	<div class="space-y-1.5">
		<Meter value={usedPercent} label={m.workspace_pvc_used()} tone={usageTone(usedPercent / 100)} />
		<p class="text-xs text-muted-foreground">{m.workspace_pvc_used_hint()}</p>
	</div>
	{#if overProvisioned}
		<p
			class="flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-2 text-xs text-warning-foreground"
		>
			<TriangleAlert class="mt-px size-3.5 shrink-0" aria-hidden="true" />
			{m.workspace_pvc_exceeds_cluster({
				capacity: `${clusterCapacity.value} ${clusterCapacity.unit}`
			})}
		</p>
	{/if}

	<div class="mt-auto space-y-2 border-t pt-4">
		<div class="flex items-baseline justify-between gap-2">
			<p class="text-sm font-medium">{m.workspace_pvc_volume_status()}</p>
			{#if total > 0}
				<p class="text-xs text-muted-foreground tabular-nums">
					{m.workspace_pvc_bound_of_total({
						bound: String(bound),
						total: String(total)
					})}
				</p>
			{/if}
		</div>
		<Meter
			value={boundPercent}
			label={m.workspace_pvc_volume_status()}
			tone={total === 0 ? 'muted' : pending > 0 ? 'warning' : 'success'}
		/>
		<dl class="divide-y pt-1 text-sm">
			<div class="flex items-center justify-between gap-2 py-1.5">
				<dt class="text-muted-foreground">{m.workspace_pvc_total_count()}</dt>
				<dd class="font-medium tabular-nums">{total}</dd>
			</div>
			<div class="flex items-center justify-between gap-2 py-1.5">
				<dt class="flex items-center gap-2 text-muted-foreground">
					<Status size="sm" variant="success" class="ring-0" />
					{m.workspace_pvc_bound_count()}
				</dt>
				<dd class="font-medium tabular-nums">{bound}</dd>
			</div>
			<div class="flex items-center justify-between gap-2 py-1.5 last:pb-0">
				<dt class="flex items-center gap-2 text-muted-foreground">
					<Status size="sm" class={cn('ring-0', toneFill[problemTone(pending, 'warning')])} />
					{m.workspace_pvc_pending()}
				</dt>
				<dd
					class={cn(
						'font-medium tabular-nums',
						pending > 0 ? 'text-warning' : 'text-muted-foreground'
					)}
				>
					{pending}
				</dd>
			</div>
		</dl>
	</div>
</WidgetCard>

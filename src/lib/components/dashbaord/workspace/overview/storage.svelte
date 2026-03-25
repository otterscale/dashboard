<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	let {
		prometheusDriver,
		cluster: _cluster,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		cluster: string;
		namespace: string;
		isReloading: boolean;
	} = $props();

	let requestedBytes: SampleValue | undefined = $state(undefined);
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
		const [reqRes, totalRes, boundRes, pendingRes] = await Promise.all([
			prometheusDriver.instantQuery(
				`sum(kube_persistentvolumeclaim_resource_requests_storage_bytes{namespace="${ns}"})`
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_info{namespace="${ns}"})`
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Bound"} == 1)`
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Pending"} == 1)`
			)
		]);
		requestedBytes = reqRes.result[0]?.value;
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

	const capacity = $derived(formatCapacity(scalar(requestedBytes) ?? 0));
	const total = $derived(scalar(totalCount) ?? 0);
	const bound = $derived(scalar(boundCount) ?? 0);
	const pending = $derived(scalar(pendingCount) ?? 0);
</script>

<Card.Root class="relative h-full min-h-[160px] gap-2 overflow-hidden">
	<Icon
		icon="ph:hard-drives"
		class="absolute -right-10 bottom-0 size-36 text-8xl tracking-tight text-nowrap text-primary/5 uppercase group-hover:hidden"
	/>
	<Card.Header>
		<Card.Title>{m.workspace_storage_title()}</Card.Title>
		<Card.Description class="text-md flex min-h-6 items-center">
			{m.workspace_storage_description()}
		</Card.Description>
	</Card.Header>
	{#if !namespace}
		<Card.Content class="text-sm text-muted-foreground">{m.workspace_namespace_unresolved()}</Card.Content>
	{:else if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Icon icon="svg-spinners:6-dots-rotate" class="size-10" />
		</div>
	{:else}
		<Card.Content class="space-y-3">
			<div>
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{m.workspace_pvc_requested()}
				</p>
				<p class="text-3xl font-semibold tabular-nums">
					{capacity.value}
					<span class="text-lg font-normal text-muted-foreground">{capacity.unit}</span>
				</p>
			</div>
			<div class="border-t border-border/60 pt-2">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{m.workspace_pvc_total_count()}
				</p>
				<p class="text-2xl font-semibold tabular-nums">{total}</p>
			</div>
			<div class="border-t border-border/60 pt-2">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{m.workspace_pvc_bound_count()}
				</p>
				<p class="text-2xl font-semibold tabular-nums">{bound}</p>
			</div>
			<div class="border-t border-border/60 pt-2">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					{m.workspace_pvc_pending()}
				</p>
				<p class="text-2xl font-semibold tabular-nums text-chart-1">{pending}</p>
			</div>
		</Card.Content>
	{/if}
</Card.Root>

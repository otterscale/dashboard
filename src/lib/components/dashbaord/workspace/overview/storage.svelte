<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { Progress } from '$lib/components/ui/progress';
	import { formatCapacity } from '$lib/formatter';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';
	import { cn } from '$lib/utils';

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
				`sum(kube_persistentvolumeclaim_resource_requests_storage_bytes{namespace="${ns}"}) or vector(0)`
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_info{namespace="${ns}"}) or vector(0)`
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Bound"} == 1) or vector(0)`
			),
			prometheusDriver.instantQuery(
				`count(kube_persistentvolumeclaim_status_phase{namespace="${ns}", phase="Pending"} == 1) or vector(0)`
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

	const boundPercent = $derived(total > 0 ? Math.min(100, Math.round((100 * bound) / total)) : 0);
</script>

<!-- 外框與 Workload health 一致；內容區維持 KPI + 掛載狀態區塊 -->
<Card.Root class="group relative h-full min-h-[280px] gap-2 overflow-hidden">
	<Icon
		icon="ph:hard-drives"
		class="absolute -right-8 bottom-0 size-32 text-7xl tracking-tight text-nowrap text-primary/[0.06] transition-opacity group-hover:text-primary/[0.09] md:size-40"
		aria-hidden="true"
	/>
	<Card.Header>
		<Card.Title>{m.workspace_storage_title()}</Card.Title>
		<Card.Description class="text-md flex min-h-6 items-center">
			{m.workspace_storage_description()}
		</Card.Description>
	</Card.Header>
	{#if !namespace}
		<Card.Content class="text-sm text-muted-foreground"
			>{m.workspace_namespace_unresolved()}</Card.Content
		>
	{:else if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<Icon icon="svg-spinners:6-dots-rotate" class="size-10 text-muted-foreground" />
		</div>
	{:else}
		<Card.Content class="relative space-y-4 px-4 pt-0 pb-5 sm:px-5">
			<div
				class="flex items-start justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3.5 ring-1 ring-border/30"
			>
				<div class="min-w-0 space-y-1">
					<p class="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
						{m.workspace_pvc_requested()}
					</p>
					<p class="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
						{capacity.value}
						<span class="text-lg font-medium text-muted-foreground">{capacity.unit}</span>
					</p>
				</div>
				<span
					class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-chart-3/15 text-chart-3"
					aria-hidden="true"
				>
					<Icon icon="ph:database" class="size-5" />
				</span>
			</div>

			<div class="space-y-3">
				<p class="text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
					{m.workspace_pvc_volume_status()}
				</p>

				<div class="flex items-end justify-between gap-2">
					<div>
						<p class="text-2xl leading-none font-semibold tabular-nums">{total}</p>
						<p class="mt-1 text-xs text-muted-foreground">{m.workspace_pvc_total_count()}</p>
					</div>
					{#if total > 0}
						<p class="max-w-[55%] text-right text-xs leading-snug text-muted-foreground">
							{m.workspace_pvc_bound_of_total({
								bound: String(bound),
								total: String(total)
							})}
						</p>
					{/if}
				</div>

				{#if total > 0}
					<Progress value={boundPercent} max={100} class="h-2 bg-muted/80" />
				{/if}

				<div class="grid grid-cols-2 gap-2 sm:gap-3">
					<div
						class="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5"
					>
						<span
							class="flex size-8 shrink-0 items-center justify-center rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
						>
							<Icon icon="ph:check-circle" class="size-4" />
						</span>
						<div class="min-w-0">
							<p class="text-lg leading-none font-semibold tabular-nums">{bound}</p>
							<p class="truncate text-[11px] text-muted-foreground">
								{m.workspace_pvc_bound_count()}
							</p>
						</div>
					</div>
					<div
						class={cn(
							'flex items-center gap-2 rounded-lg border px-3 py-2.5',
							pending > 0 ? 'border-amber-500/30 bg-amber-500/10' : 'border-border/60 bg-muted/15'
						)}
					>
						<span
							class={cn(
								'flex size-8 shrink-0 items-center justify-center rounded-md',
								pending > 0
									? 'bg-amber-500/20 text-amber-700 dark:text-amber-400'
									: 'bg-muted text-muted-foreground'
							)}
						>
							<Icon icon="ph:clock" class="size-4" />
						</span>
						<div class="min-w-0">
							<p
								class={cn(
									'text-lg leading-none font-semibold tabular-nums',
									pending > 0 && 'text-amber-700 dark:text-amber-400'
								)}
							>
								{pending}
							</p>
							<p class="truncate text-[11px] text-muted-foreground">{m.workspace_pvc_pending()}</p>
						</div>
					</div>
				</div>
			</div>
		</Card.Content>
	{/if}
</Card.Root>

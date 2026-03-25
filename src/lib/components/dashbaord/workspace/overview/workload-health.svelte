<script lang="ts">
	import { HeartPulse, LoaderCircle } from '@lucide/svelte';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { Progress } from '$lib/components/ui/progress';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	type WorkloadKind = {
		group: string;
		kind: string;
	};

	const WORKLOAD_SPECS: WorkloadKind[] = [
		{ group: 'model.otterscale.io', kind: 'ModelService' },
		{ group: 'workload.otterscale.io', kind: 'Application' },
		{ group: 'helm.toolkit.fluxcd.io', kind: 'HelmRelease' },
		{ group: 'kubevirt.io', kind: 'VirtualMachine' }
	];

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		isReloading: boolean;
	} = $props();

	const workloadLabels = $derived([
		m.model(),
		m.application(),
		m.release(),
		m.workspace_workload_vm_label()
	]);

	let rows: { label: string; ready: number; total: number }[] = $state([]);

	function scalar(v: SampleValue | undefined): number {
		if (v?.value === undefined || v?.value === null) return 0;
		const n = Number(v.value);
		return Number.isFinite(n) ? n : 0;
	}

	async function fetchWorkload(w: WorkloadKind, label: string, ns: string) {
		const g = escapePromqlStringLiteral(w.group);
		const k = escapePromqlStringLiteral(w.kind);
		const n = escapePromqlStringLiteral(ns);

		const totalQ = `count(kube_customresource_info{namespace="${n}", group="${g}", kind="${k}"})`;
		const readyQ = `count(kube_customresource_status_condition{namespace="${n}", group="${g}", kind="${k}", condition="Ready", status="true"})`;

		const [totalR, readyR] = await Promise.all([
			prometheusDriver.instantQuery(totalQ),
			prometheusDriver.instantQuery(readyQ)
		]);

		return {
			label,
			ready: Math.round(scalar(readyR.result[0]?.value)),
			total: Math.round(scalar(totalR.result[0]?.value))
		};
	}

	async function fetch() {
		try {
			if (!namespace) {
				rows = [];
				return;
			}
			const labels = workloadLabels;
			rows = await Promise.all(
				WORKLOAD_SPECS.map((w, i) => fetchWorkload(w, labels[i]!, namespace))
			);
		} catch (error) {
			console.error('Failed to fetch workspace workload health:', error);
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
</script>

<Card.Root class="group relative h-full min-h-[280px] gap-2 overflow-hidden">
	<HeartPulse
		class="absolute -right-8 bottom-0 size-32 text-7xl tracking-tight text-nowrap text-primary/[0.06] transition-opacity group-hover:text-primary/[0.09] md:size-40"
		aria-hidden="true"
	/>
	<Card.Header>
		<Card.Title>{m.workspace_workload_health_title()}</Card.Title>
		<Card.Description class="text-md flex min-h-6 items-center">
			{m.workspace_workload_health_description()}
		</Card.Description>
	</Card.Header>
	{#if !namespace}
		<Card.Content class="text-sm text-muted-foreground"
			>{m.workspace_namespace_unresolved()}</Card.Content
		>
	{:else if !isLoaded}
		<div class="flex h-9 w-full items-center justify-center">
			<LoaderCircle class="size-10 animate-spin text-muted-foreground" />
		</div>
	{:else}
		<Card.Content class="space-y-2.5">
			{#each rows as row (row.label)}
				{@const pct = row.total > 0 ? Math.min(100, Math.round((100 * row.ready) / row.total)) : 0}
				<div class="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5">
					<div class="flex items-center justify-between gap-2">
						<span class="text-sm font-medium">{row.label}</span>
						<span class="shrink-0 text-sm text-muted-foreground tabular-nums">
							{m.workspace_workload_ready_ratio({
								ready: String(row.ready),
								total: String(row.total)
							})}
						</span>
					</div>
					<Progress value={pct} max={100} class="h-1.5 bg-muted/80" />
				</div>
			{/each}
		</Card.Content>
	{/if}
</Card.Root>

<script lang="ts">
	import BriefcaseMedical from '@lucide/svelte/icons/briefcase-medical';
	import ChartBar from '@lucide/svelte/icons/chart-bar';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import OctagonAlert from '@lucide/svelte/icons/octagon-alert';
	import Rocket from '@lucide/svelte/icons/rocket';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';
	import { onDestroy, onMount } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import * as Card from '$lib/components/ui/card';
	import { m } from '$lib/paraglide/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	let {
		prometheusDriver,
		namespace,
		start = new Date(Date.now() - 60 * 60 * 1000),
		end = new Date(),
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		start?: Date;
		end?: Date;
		isReloading: boolean;
	} = $props();

	type PodRolloutSnapshot = {
		running: number;
		unknown: number;
		notReady: number;
		succeeded: number;
		crashLoop: number;
		imagePull: number;
		configError: number;
		deployReady: number;
		deployDesired: number;
		stsReady: number;
		stsDesired: number;
		dsReady: number;
		dsDesired: number;
		pvcPending: number;
		jobFailed: number;
		oomKilled: number;
	};

	let snap: PodRolloutSnapshot | undefined = $state(undefined);

	function num(v: SampleValue | undefined): number {
		if (v?.value === undefined || v?.value === null) return 0;
		const n = Number(v.value);
		return Number.isFinite(n) ? Math.round(n) : 0;
	}

	const containerIssueTotal = $derived.by(() => {
		const s = snap;
		if (s === undefined) return 0;
		return s.crashLoop + s.imagePull + s.configError + s.oomKilled;
	});

	async function fetchAll(ns: string) {
		const n = escapePromqlStringLiteral(ns);
		const base = `namespace="${n}"`;

		const q = [
			`sum(kube_pod_status_phase{${base}, phase="Running", container!=""})`,
			`sum(kube_pod_status_phase{${base}, phase="Unknown", container!=""})`,
			`sum(kube_pod_status_condition{${base}, condition="Ready", status="false"}) or vector(0)`,
			`sum(kube_pod_status_phase{${base}, phase="Succeeded", container!=""})`,
			`sum(kube_pod_container_status_waiting_reason{${base}, reason="CrashLoopBackOff"}) or vector(0)`,
			`sum(kube_pod_container_status_waiting_reason{${base}, reason="ImagePullBackOff"}) or vector(0)`,
			`sum(kube_pod_container_status_waiting_reason{${base}, reason="CreateContainerConfigError"}) or vector(0)`,
			`sum(kube_deployment_status_replicas_available{${base}}) or vector(0)`,
			`sum(kube_deployment_spec_replicas{${base}}) or vector(0)`,
			`sum(kube_statefulset_status_replicas_ready{${base}}) or vector(0)`,
			`sum(kube_statefulset_replicas{${base}}) or vector(0)`,
			`sum(kube_daemonset_status_number_ready{${base}}) or vector(0)`,
			`sum(kube_daemonset_status_desired_number_scheduled{${base}}) or vector(0)`,
			`count(kube_persistentvolumeclaim_status_phase{${base}, phase="Pending"} == 1) or vector(0)`,
			`sum(kube_job_status_failed{${base}}) or vector(0)`,
			`sum(kube_pod_container_status_last_terminated_reason{${base}, reason="OOMKilled"}) or vector(0)`
		];

		const results = await Promise.all(q.map((query) => prometheusDriver.instantQuery(query, end)));

		snap = {
			running: num(results[0]?.result[0]?.value),
			unknown: num(results[1]?.result[0]?.value),
			notReady: num(results[2]?.result[0]?.value),
			succeeded: num(results[3]?.result[0]?.value),
			crashLoop: num(results[4]?.result[0]?.value),
			imagePull: num(results[5]?.result[0]?.value),
			configError: num(results[6]?.result[0]?.value),
			deployReady: num(results[7]?.result[0]?.value),
			deployDesired: num(results[8]?.result[0]?.value),
			stsReady: num(results[9]?.result[0]?.value),
			stsDesired: num(results[10]?.result[0]?.value),
			dsReady: num(results[11]?.result[0]?.value),
			dsDesired: num(results[12]?.result[0]?.value),
			pvcPending: num(results[13]?.result[0]?.value),
			jobFailed: num(results[14]?.result[0]?.value),
			oomKilled: num(results[15]?.result[0]?.value)
		};
	}

	async function fetch() {
		try {
			if (!namespace) {
				snap = undefined;
				return;
			}
			await fetchAll(namespace);
		} catch (error) {
			console.error('Failed to fetch namespace pod & rollout health:', error);
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

	$effect(() => {
		void start;
		void end;
		if (isLoaded) fetch();
	});

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	function ratio(ready: number, desired: number): string {
		return m.workspace_workload_ready_ratio({
			ready: String(ready),
			total: String(desired)
		});
	}

	type Kpi = { label: string; value: number; tone: 'default' | 'success' | 'warn' | 'danger' };
	const kpis = $derived.by((): Kpi[] => {
		if (!snap) return [];
		return [
			{ label: m.workspace_pods_running(), value: snap.running, tone: 'success' },
			{
				label: m.workspace_pods_not_ready(),
				value: snap.notReady,
				tone: snap.notReady > 0 ? 'warn' : 'default'
			},
			{
				label: m.workspace_pod_rollout_kpi_issues(),
				value: containerIssueTotal,
				tone: containerIssueTotal > 0 ? 'danger' : 'default'
			},
			{ label: m.workspace_pods_succeeded(), value: snap.succeeded, tone: 'default' }
		];
	});

	const toneClass: Record<Kpi['tone'], string> = {
		default: 'text-foreground',
		success: 'text-emerald-600 dark:text-emerald-400',
		warn: 'text-amber-600 dark:text-amber-400',
		danger: 'text-destructive'
	};
</script>

<Card.Root
	class="group relative overflow-hidden border-border/80 bg-card/50 shadow-sm ring-1 ring-border/40"
>
	<BriefcaseMedical
		class="absolute -right-8 bottom-0 size-32 text-7xl tracking-tight text-nowrap text-primary/[0.06] transition-opacity group-hover:text-primary/[0.09] md:size-40"
		aria-hidden="true"
	/>
	<Card.Header class="relative space-y-2 pb-2">
		<Card.Title class="text-lg font-semibold tracking-tight md:text-xl">
			{m.workspace_pod_rollout_health_title()}
		</Card.Title>
		<Card.Description class="max-w-3xl text-sm leading-relaxed text-muted-foreground">
			{m.workspace_pod_rollout_health_description()}
		</Card.Description>
	</Card.Header>
	{#if !namespace}
		<Card.Content class="text-sm text-muted-foreground"
			>{m.workspace_namespace_unresolved()}</Card.Content
		>
	{:else if !isLoaded}
		<div class="flex min-h-[200px] w-full items-center justify-center py-10">
			<LoaderCircle class="size-10 animate-spin text-muted-foreground" />
		</div>
	{:else if !snap}
		<div class="flex flex-col items-center justify-center gap-2 py-12">
			<ChartBar class="size-8 text-muted-foreground/80" />
			<p class="text-sm text-muted-foreground">{m.no_data_display()}</p>
		</div>
	{:else}
		<Card.Content class="relative space-y-6 px-4 pt-0 pb-6 sm:px-6">
			<!-- Quick scan: headline metrics -->
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
				{#each kpis as k (k.label)}
					<div
						class="flex flex-col gap-1 rounded-xl border border-border/60 bg-muted/25 px-3 py-3 shadow-sm backdrop-blur-sm transition-colors hover:bg-muted/35"
					>
						<span class="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
							>{k.label}</span
						>
						<span class={cn('text-2xl font-semibold tabular-nums sm:text-3xl', toneClass[k.tone])}
							>{k.value}</span
						>
					</div>
				{/each}
			</div>

			<!-- Detail panels -->
			<div class="grid gap-4 lg:grid-cols-3 lg:gap-5">
				<section
					class="flex min-w-0 flex-col rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm ring-1 ring-border/30"
				>
					<div class="mb-3 flex items-center gap-2.5">
						<span
							class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-chart-2/15 text-chart-2"
						>
							<LayoutGrid class="size-5" />
						</span>
						<h3 class="text-sm leading-none font-semibold">{m.workspace_health_section_pods()}</h3>
					</div>
					<ul class="divide-y divide-border/50 text-sm">
						<li class="flex items-center justify-between gap-3 py-2.5 first:pt-0">
							<span class="min-w-0 text-muted-foreground">{m.workspace_pods_running()}</span>
							<span class="shrink-0 font-medium text-chart-2 tabular-nums">{snap.running}</span>
						</li>
						<li class="flex items-center justify-between gap-3 py-2.5">
							<span class="min-w-0 text-muted-foreground">{m.workspace_pods_unknown()}</span>
							<span class="shrink-0 font-medium tabular-nums">{snap.unknown}</span>
						</li>
						<li class="flex items-center justify-between gap-3 py-2.5">
							<span class="min-w-0 text-muted-foreground">{m.workspace_pods_not_ready()}</span>
							<span class="shrink-0 font-semibold text-amber-600 tabular-nums dark:text-amber-400"
								>{snap.notReady}</span
							>
						</li>
						<li class="flex items-center justify-between gap-3 py-2.5">
							<span class="min-w-0 text-muted-foreground">{m.workspace_pods_succeeded()}</span>
							<span class="shrink-0 font-medium tabular-nums">{snap.succeeded}</span>
						</li>
					</ul>
				</section>

				<section
					class="flex min-w-0 flex-col rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm ring-1 ring-border/30"
				>
					<div class="mb-3 flex items-center gap-2.5">
						<span
							class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/15 text-destructive"
						>
							<OctagonAlert class="size-5" />
						</span>
						<h3 class="text-sm leading-none font-semibold">
							{m.workspace_health_section_containers()}
						</h3>
					</div>
					<ul class="divide-y divide-border/50 text-sm">
						{#each [{ label: m.workspace_containers_crashloop(), value: snap.crashLoop }, { label: m.workspace_containers_image_pull(), value: snap.imagePull }, { label: m.workspace_containers_config_error(), value: snap.configError }, { label: m.workspace_containers_oom_killed(), value: snap.oomKilled }] as row (row.label)}
							<li class="flex items-center justify-between gap-3 py-2.5 first:pt-0">
								<span class="min-w-0 truncate text-muted-foreground">{row.label}</span>
								<span class="shrink-0 font-semibold text-destructive tabular-nums">{row.value}</span
								>
							</li>
						{/each}
					</ul>
				</section>

				<section
					class="flex min-w-0 flex-col rounded-2xl border border-border/70 bg-background/80 p-4 shadow-sm ring-1 ring-border/30"
				>
					<div class="mb-3 flex items-center gap-2.5">
						<span
							class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary"
						>
							<Rocket class="size-5" />
						</span>
						<h3 class="text-sm leading-none font-semibold">
							{m.workspace_health_section_rollouts()}
						</h3>
					</div>
					<ul class="divide-y divide-border/50 text-sm">
						<li class="flex items-center justify-between gap-3 py-2.5 first:pt-0">
							<span class="min-w-0 text-muted-foreground">{m.deployment()}</span>
							<span class="shrink-0 font-medium tabular-nums"
								>{ratio(snap.deployReady, snap.deployDesired)}</span
							>
						</li>
						<li class="flex items-center justify-between gap-3 py-2.5">
							<span class="min-w-0 text-muted-foreground">{m.stateful_set()}</span>
							<span class="shrink-0 font-medium tabular-nums"
								>{ratio(snap.stsReady, snap.stsDesired)}</span
							>
						</li>
						<li class="flex items-center justify-between gap-3 py-2.5">
							<span class="min-w-0 text-muted-foreground">{m.daemon_set()}</span>
							<span class="shrink-0 font-medium tabular-nums"
								>{ratio(snap.dsReady, snap.dsDesired)}</span
							>
						</li>
						<li class="flex items-center justify-between gap-3 py-2.5">
							<span class="min-w-0 text-muted-foreground">{m.workspace_pvc_pending()}</span>
							<span class="shrink-0 font-semibold text-amber-600 tabular-nums dark:text-amber-400"
								>{snap.pvcPending}</span
							>
						</li>
						<li class="flex items-center justify-between gap-3 py-2.5">
							<span class="min-w-0 text-muted-foreground">{m.workspace_job_failed_pods()}</span>
							<span class="shrink-0 font-semibold text-destructive tabular-nums"
								>{snap.jobFailed}</span
							>
						</li>
					</ul>
				</section>
			</div>
		</Card.Content>
	{/if}
</Card.Root>

<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import LayoutGridIcon from '@lucide/svelte/icons/layout-grid';
	import RocketIcon from '@lucide/svelte/icons/rocket';
	import type { PrometheusDriver } from 'prometheus-query';
	import { onDestroy, onMount, type Snippet } from 'svelte';

	import { ReloadManager } from '$lib/components/custom/reloader';
	import { Panel, widgetState } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	import {
		DEPLOYMENT,
		JOB,
		type LinkTarget,
		namesLink,
		namesListLink,
		phaseListLink,
		POD,
		PVC,
		STATEFUL_SET
	} from './links';
	import OverviewLink from './overview-link.svelte';
	import { type Count, type PodSignals, podSignals } from './pod-signals';

	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable()
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		isReloading: boolean;
	} = $props();

	type Rollout = { ready: number; desired: number; notReady: string[] };
	type Snapshot = {
		pods: PodSignals;
		deployments: Rollout;
		statefulSets: Rollout;
		daemonSets: { ready: number; desired: number };
		pendingClaims: string[];
		failedJobs: { value: number; names: string[] };
	};

	/** `null`: Prometheus has nothing for the namespace. */
	let snap = $state<Snapshot | null | undefined>(undefined);
	let hasError = $state(false);

	type Sample = { metric: { labels: Record<string, string> }; value: { value: number } };

	async function fetchAll(): Promise<Snapshot | null> {
		const n = escapePromqlStringLiteral(namespace);
		const ns = `namespace="${n}"`;
		const evalAt = new Date();
		const ask = async (query: string) =>
			(await prometheusDriver.instantQuery(query, evalAt)).result as Sample[];
		const label = (samples: Sample[], key: string) =>
			samples.map((s) => s.metric?.labels?.[key]).filter((v): v is string => !!v);
		const total = (samples: Sample[]) =>
			Math.round(samples.reduce((sum, s) => sum + (Number(s.value?.value) || 0), 0));

		// Each query names its pods, so a count can list them and link to them.
		const recent = (metric: string, seconds: number) =>
			`(time() - ${metric}_last_terminated_timestamp{${ns}} < ${seconds})`;
		const [
			phases,
			notReady,
			waiting,
			initWaiting,
			crashLooping,
			oomLastExit,
			oomRecent,
			restarts,
			initRestarts,
			deployReady,
			deployDesired,
			deployShort,
			stsReady,
			stsDesired,
			stsShort,
			dsReady,
			dsDesired,
			pendingClaims,
			failedJobs,
			namespaceSeen
		] = await Promise.all([
			ask(`max by (pod, phase) (kube_pod_status_phase{${ns}} == 1)`),
			ask(
				`max by (pod) (kube_pod_status_ready{${ns}, condition="false"} == 1) unless on (pod) max by (pod) (kube_pod_status_phase{${ns}, phase=~"Succeeded|Failed"} == 1)`
			),
			ask(`max by (pod, reason) (kube_pod_container_status_waiting_reason{${ns}} == 1)`),
			ask(`max by (pod, reason) (kube_pod_init_container_status_waiting_reason{${ns}} == 1)`),
			// Restarted before and crashed in the last 10 minutes: crash-looping, even while the
			// container runs between two back-offs.
			ask(
				`max by (pod) ((kube_pod_container_status_restarts_total{${ns}} >= 2) and on (namespace, pod, container) ${recent('kube_pod_container_status', 600)}) or max by (pod) ((kube_pod_init_container_status_restarts_total{${ns}} >= 2) and on (namespace, pod, container) ${recent('kube_pod_init_container_status', 600)})`
			),
			ask(
				`max by (pod) (kube_pod_container_status_last_terminated_reason{${ns}, reason="OOMKilled"} == 1) or max by (pod) (kube_pod_init_container_status_last_terminated_reason{${ns}, reason="OOMKilled"} == 1)`
			),
			ask(
				`max by (pod) ((kube_pod_container_status_last_terminated_reason{${ns}, reason="OOMKilled"} == 1) and on (namespace, pod, container) ${recent('kube_pod_container_status', 3600)}) or max by (pod) ((kube_pod_init_container_status_last_terminated_reason{${ns}, reason="OOMKilled"} == 1) and on (namespace, pod, container) ${recent('kube_pod_init_container_status', 3600)})`
			),
			ask(`sum by (pod) (increase(kube_pod_container_status_restarts_total{${ns}}[24h]))`),
			ask(`sum by (pod) (increase(kube_pod_init_container_status_restarts_total{${ns}}[24h]))`),
			ask(`sum(kube_deployment_status_replicas_available{${ns}})`),
			ask(`sum(kube_deployment_spec_replicas{${ns}})`),
			ask(
				`max by (deployment) (kube_deployment_spec_replicas{${ns}} > kube_deployment_status_replicas_available{${ns}})`
			),
			ask(`sum(kube_statefulset_status_replicas_ready{${ns}})`),
			ask(`sum(kube_statefulset_replicas{${ns}})`),
			ask(
				`max by (statefulset) (kube_statefulset_replicas{${ns}} > kube_statefulset_status_replicas_ready{${ns}})`
			),
			ask(`sum(kube_daemonset_status_number_ready{${ns}})`),
			ask(`sum(kube_daemonset_status_desired_number_scheduled{${ns}})`),
			ask(
				`max by (persistentvolumeclaim) (kube_persistentvolumeclaim_status_phase{${ns}, phase="Pending"} == 1)`
			),
			ask(`max by (job_name) (kube_job_status_failed{${ns}} > 0)`),
			// kube-state-metrics sees the namespace: with no pods every query above is empty, and
			// this tells "no pods" from "no data".
			ask(`count(kube_namespace_created{${ns}})`)
		]);

		// Containers and init containers restart separately; a pod's count is both.
		const restartsByPod: Record<string, number> = {};
		for (const s of [...restarts, ...initRestarts]) {
			const pod = s.metric?.labels?.pod;
			if (pod) restartsByPod[pod] = (restartsByPod[pod] ?? 0) + (Number(s.value?.value) || 0);
		}

		if (namespaceSeen.length === 0) return null;
		return {
			pods: podSignals({
				phases: phases.flatMap((s) =>
					s.metric?.labels?.pod && s.metric.labels.phase
						? [{ pod: s.metric.labels.pod, phase: s.metric.labels.phase }]
						: []
				),
				notReady: label(notReady, 'pod'),
				waiting: [...waiting, ...initWaiting].flatMap((s) =>
					s.metric?.labels?.pod && s.metric.labels.reason
						? [{ pod: s.metric.labels.pod, reason: s.metric.labels.reason }]
						: []
				),
				crashLooping: label(crashLooping, 'pod'),
				oomLastExit: label(oomLastExit, 'pod'),
				oomRecent: label(oomRecent, 'pod'),
				restarts: Object.entries(restartsByPod).map(([pod, count]) => ({ pod, count }))
			}),
			deployments: {
				ready: total(deployReady),
				desired: total(deployDesired),
				notReady: label(deployShort, 'deployment')
			},
			statefulSets: {
				ready: total(stsReady),
				desired: total(stsDesired),
				notReady: label(stsShort, 'statefulset')
			},
			daemonSets: { ready: total(dsReady), desired: total(dsDesired) },
			pendingClaims: label(pendingClaims, 'persistentvolumeclaim'),
			failedJobs: { value: total(failedJobs), names: label(failedJobs, 'job_name') }
		};
	}

	async function fetch() {
		if (!namespace) return;
		try {
			snap = await fetchAll();
			hasError = false;
		} catch (error) {
			hasError = true;
			snap = undefined;
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

	let isLoaded = $state(false);
	onMount(async () => {
		await fetch();
		isLoaded = true;
	});
	onDestroy(() => {
		reloadManager.stop();
	});

	/**
	 * `bad` for a count of errors, `warn` for one that needs a look, `ok` for one that is good
	 * news; any of them is quiet at zero.
	 */
	type Tone = 'ok' | 'warn' | 'bad' | 'plain';
	const TONE_TEXT: Record<Tone, string> = {
		ok: 'text-chart-2',
		warn: 'text-chart-1',
		bad: 'text-destructive',
		plain: ''
	};

	type Row = {
		label: string;
		/** What is shown; a number, or `ready / desired`. */
		text: string;
		/** Zero, `None`: quiet and no link. */
		quiet: boolean;
		tone: Tone;
		target: LinkTarget | null;
		names: string[];
	};

	function countRow(label: string, c: Count, tone: Tone, target: LinkTarget | null): Row {
		return {
			label,
			text: String(c.value),
			quiet: c.value === 0,
			tone,
			target: c.value > 0 ? target : null,
			names: c.names
		};
	}

	function rolloutRow(label: string, r: Rollout, kind: typeof DEPLOYMENT): Row {
		if (r.desired === 0) {
			return {
				label,
				text: m.dashboard_none(),
				quiet: true,
				tone: 'plain',
				target: null,
				names: []
			};
		}
		const short = r.notReady.length > 0 || r.ready < r.desired;
		return {
			label,
			text: m.workspace_workload_ready_ratio({ ready: String(r.ready), total: String(r.desired) }),
			quiet: false,
			tone: short ? 'warn' : 'plain',
			target: short ? namesLink(kind, namespace, r.notReady) : null,
			names: r.notReady
		};
	}

	const columns = $derived.by(() => {
		const s = snap;
		if (!s) return [];
		const p = s.pods;
		const pods = (names: string[]) => namesLink(POD, namespace, names);
		return [
			{
				title: m.workspace_health_section_pods(),
				icon: LayoutGridIcon,
				rows: [
					countRow(
						m.workspace_pods_running(),
						p.running,
						'ok',
						phaseListLink(POD, namespace, 'Running')
					),
					countRow(
						m.workspace_pods_pending(),
						p.pending,
						'warn',
						phaseListLink(POD, namespace, 'Pending')
					),
					countRow(m.workspace_pods_not_ready(), p.notReady, 'warn', pods(p.notReady.names)),
					countRow(
						m.workspace_pods_unknown(),
						p.unknown,
						'bad',
						phaseListLink(POD, namespace, 'Unknown')
					),
					countRow(
						m.workspace_pods_succeeded(),
						p.succeeded,
						'plain',
						phaseListLink(POD, namespace, 'Succeeded')
					)
				]
			},
			{
				title: m.workspace_health_section_containers(),
				icon: CircleAlertIcon,
				rows: [
					countRow(m.workspace_containers_crashloop(), p.crashLoop, 'bad', pods(p.crashLoop.names)),
					countRow(
						m.workspace_containers_image_pull(),
						p.imagePull,
						'bad',
						pods(p.imagePull.names)
					),
					countRow(
						m.workspace_containers_config_error(),
						p.configError,
						'bad',
						pods(p.configError.names)
					),
					countRow(
						m.workspace_containers_oom_killed(),
						p.oomKilled,
						'bad',
						pods(p.oomKilled.names)
					),
					countRow(
						m.workspace_containers_restarts_24h(),
						p.restarts,
						'warn',
						pods(p.restarts.names)
					)
				]
			},
			{
				title: m.workspace_health_section_rollouts(),
				icon: RocketIcon,
				rows: [
					rolloutRow(m.deployment(), s.deployments, DEPLOYMENT),
					rolloutRow(m.stateful_set(), s.statefulSets, STATEFUL_SET),
					s.daemonSets.desired === 0
						? {
								label: m.daemon_set(),
								text: m.dashboard_none(),
								quiet: true,
								tone: 'plain' as Tone,
								target: null,
								names: []
							}
						: {
								label: m.daemon_set(),
								text: m.workspace_workload_ready_ratio({
									ready: String(s.daemonSets.ready),
									total: String(s.daemonSets.desired)
								}),
								quiet: false,
								tone: (s.daemonSets.ready < s.daemonSets.desired ? 'warn' : 'plain') as Tone,
								target: null,
								names: []
							},
					countRow(
						m.workspace_pvc_pending(),
						{ value: s.pendingClaims.length, names: s.pendingClaims },
						'warn',
						phaseListLink(PVC, namespace, 'Pending')
					),
					countRow(
						m.workspace_job_failed_pods(),
						s.failedJobs,
						'bad',
						s.failedJobs.names.length > 0 ? namesListLink(JOB, namespace, s.failedJobs.names) : null
					)
				]
			}
		];
	});

	/** The strip under the title: the verdict, then the counts behind it. */
	const tiles = $derived.by(() => {
		const s = snap;
		if (!s) return [];
		const p = s.pods;
		const failing =
			p.attention.names.length > 0 ? namesListLink(POD, namespace, p.attention.names) : null;
		return [
			countRow(
				m.workspace_pods_running(),
				p.running,
				'ok',
				phaseListLink(POD, namespace, 'Running')
			),
			countRow(
				m.workspace_pods_not_ready(),
				p.notReady,
				'warn',
				namesLink(POD, namespace, p.notReady.names)
			),
			countRow(m.workspace_pod_rollout_kpi_issues(), p.attention, 'bad', failing),
			countRow(
				m.workspace_pods_succeeded(),
				p.succeeded,
				'plain',
				phaseListLink(POD, namespace, 'Succeeded')
			)
		];
	});

	const attention = $derived(snap?.pods.attention);
	const attentionTarget = $derived(
		attention && attention.value > 0 ? namesListLink(POD, namespace, attention.names) : null
	);
</script>

{#snippet value(row: Row, cls: string)}
	{#if row.quiet}
		<span class="{cls} text-muted-foreground">{row.text}</span>
	{:else}
		<OverviewLink target={row.target} names={row.names} class="{cls} {TONE_TEXT[row.tone]}">
			{row.text}
		</OverviewLink>
	{/if}
{/snippet}

{#snippet section(title: string, icon: typeof LayoutGridIcon, body: Snippet)}
	{@const Icon = icon}
	<section class="min-w-0">
		<h3 class="flex items-center gap-2 text-sm font-[550]">
			<span
				class="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
			>
				<Icon class="size-4" aria-hidden="true" />
			</span>
			{title}
		</h3>
		<ul class="mt-2 divide-y divide-border text-sm">
			{@render body()}
		</ul>
	</section>
{/snippet}

<Panel
	title={m.workspace_pod_rollout_health_title()}
	description={m.workspace_pod_rollout_health_description()}
	state={namespace ? widgetState(isLoaded, !!snap, hasError) : 'empty'}
	class="min-h-[61.5625rem] @md:min-h-[61.8125rem] @min-[44.5rem]:min-h-[24.3125rem]"
>
	{#if snap && attention}
		<div class="flex flex-col gap-3 slashed-zero tabular-nums">
			<!-- The verdict first, its colour the state: mint while nothing needs a look, the
			     attention colour once something does. The rest are the counts behind it. A tile with
			     something to open opens as a whole. Two columns with the verdict on its own row, or
			     one row; the min-heights above follow these two layouts (`@min-[44.5rem]` is the
			     panel's `@2xl` plus its 2 × 20px padding). -->
			<div class="grid grid-cols-2 gap-2 @2xl/panel:grid-cols-6">
				<OverviewLink
					target={attentionTarget}
					names={attention.names}
					block
					class="col-span-2 rounded-lg px-3 py-2.5 {attention.value === 0
						? 'bg-mint text-mint-foreground'
						: 'bg-attention text-attention-foreground'}"
				>
					<span class="block truncate text-xs leading-4 opacity-70"
						>{m.dashboard_pods_need_attention()}</span
					>
					<span class="mt-1 flex items-center gap-2 text-2xl leading-8 tracking-tight">
						<span
							class="size-2 shrink-0 rounded-full {attention.value === 0
								? 'bg-chart-2'
								: 'bg-chart-1'}"
							aria-hidden="true"
						></span>
						<span class="group-hover/link:underline group-hover/link:underline-offset-4"
							>{attention.value === 0 ? m.dashboard_all_clear() : attention.value}</span
						>
					</span>
				</OverviewLink>
				{#each tiles as tile (tile.label)}
					<OverviewLink
						target={tile.quiet ? null : tile.target}
						names={tile.names}
						block
						class="block border-l border-border py-1 pl-3"
					>
						<span class="block truncate text-xs leading-4 text-muted-foreground">{tile.label}</span>
						<span
							class="mt-1 block text-2xl leading-8 tracking-tight group-hover/link:underline group-hover/link:underline-offset-4 {tile.quiet
								? 'text-muted-foreground'
								: TONE_TEXT[tile.tone]}">{tile.text}</span
						>
					</OverviewLink>
				{/each}
			</div>
			<!-- Each row is a name and a number; the names behind a number are in its tooltip. -->
			<div class="grid gap-x-8 gap-y-4 border-t border-border pt-3 @2xl/panel:grid-cols-3">
				{#each columns as column (column.title)}
					{#snippet rows()}
						{#each column.rows as row (row.label)}
							<li class="flex h-9 items-center justify-between gap-3">
								<span class="min-w-0 truncate">{row.label}</span>
								{@render value(row, 'shrink-0 font-medium')}
							</li>
						{/each}
					{/snippet}
					{@render section(column.title, column.icon, rows)}
				{/each}
			</div>
		</div>
	{/if}
</Panel>

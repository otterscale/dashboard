<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleDashedIcon from '@lucide/svelte/icons/circle-dashed';
	import CirclePlayIcon from '@lucide/svelte/icons/circle-play';
	import OctagonAlertIcon from '@lucide/svelte/icons/octagon-alert';
	import type { PrometheusDriver, SampleValue } from 'prometheus-query';

	import { useLoadable } from '$lib/components/dashboard/shared/loadable.svelte';
	import StatCard from '$lib/components/dashboard/shared/stat-card.svelte';
	import { type Level, levelOfCount, levelText } from '$lib/components/dashboard/shared/status';
	import WidgetCard from '$lib/components/dashboard/shared/widget-card.svelte';
	import { m } from '$lib/messages';
	import { escapePromqlStringLiteral } from '$lib/prometheus';

	import ValueList from './value-list.svelte';

	// One fetch (sixteen instant queries) feeds seven cards: the four stat tiles
	// and the three lists. The root is `display: contents`, so the page's grid
	// places the stat row and each list card itself (`statsClass`, `listClass`).
	let {
		prometheusDriver,
		namespace,
		isReloading = $bindable(),
		statsClass,
		listClass
	}: {
		prometheusDriver: PrometheusDriver;
		namespace: string;
		isReloading: boolean;
		/** Grid placement of the row of four stat tiles. */
		statsClass?: string;
		/** Grid placement of each of the three list cards. */
		listClass?: string;
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

	function num(v: SampleValue | undefined): number {
		if (v?.value === undefined || v?.value === null) return 0;
		const n = Number(v.value);
		return Number.isFinite(n) ? Math.round(n) : 0;
	}

	async function fetchAll(ns: string): Promise<PodRolloutSnapshot | null> {
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

		const evalAt = new Date();
		const results = await Promise.all(
			q.map((query) => prometheusDriver.instantQuery(query, evalAt))
		);

		// Every query answered with no series at all: nothing is reporting on this
		// namespace. (A live kube-state-metrics answers the `or vector(0)` ones with 0.)
		if (results.every((r) => r.result.length === 0)) return null;

		return {
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

	const health = useLoadable<PodRolloutSnapshot>(
		async () => (namespace ? fetchAll(namespace) : null),
		() => isReloading
	);

	const snap = $derived(health.data);
	const emptyDescription = $derived(namespace ? undefined : m.workspace_namespace_unresolved());

	const containerIssueTotal = $derived(
		snap ? snap.crashLoop + snap.imagePull + snap.configError + snap.oomKilled : 0
	);

	function ratio(ready: number, desired: number): string {
		return m.workspace_workload_ready_ratio({
			ready: String(ready),
			total: String(desired)
		});
	}

	/** A rollout short of its desired replicas is a warning; a complete or absent one is not. */
	function rolloutLevel(ready: number, desired: number): Level {
		return ready < desired ? 'warn' : 'neutral';
	}

	type Row = { label: string; value: string | number; level?: Level };

	const stats = $derived([
		{
			label: m.workspace_pods_running(),
			icon: CirclePlayIcon,
			value: snap?.running ?? 0,
			level: 'neutral' as Level
		},
		{
			label: m.workspace_pods_not_ready(),
			icon: CircleDashedIcon,
			value: snap?.notReady ?? 0,
			level: levelOfCount(snap?.notReady ?? 0, 'warn')
		},
		{
			label: m.wso_container_issues(),
			icon: OctagonAlertIcon,
			value: containerIssueTotal,
			level: levelOfCount(containerIssueTotal, 'danger')
		},
		{
			label: m.workspace_pods_succeeded(),
			icon: CircleCheckIcon,
			value: snap?.succeeded ?? 0,
			level: 'neutral' as Level
		}
	]);

	const lists = $derived.by((): { title: string; rows: Row[]; size: number }[] => {
		const s = snap;
		return [
			{
				title: m.workspace_health_section_pods(),
				size: 4,
				rows: s
					? [
							{ label: m.workspace_pods_running(), value: s.running },
							{
								label: m.workspace_pods_unknown(),
								value: s.unknown,
								level: levelOfCount(s.unknown, 'warn')
							},
							{
								label: m.workspace_pods_not_ready(),
								value: s.notReady,
								level: levelOfCount(s.notReady, 'warn')
							},
							{ label: m.workspace_pods_succeeded(), value: s.succeeded }
						]
					: []
			},
			{
				title: m.workspace_health_section_containers(),
				size: 4,
				rows: s
					? [
							{
								label: m.workspace_containers_crashloop(),
								value: s.crashLoop,
								level: levelOfCount(s.crashLoop, 'danger')
							},
							{
								label: m.workspace_containers_image_pull(),
								value: s.imagePull,
								level: levelOfCount(s.imagePull, 'danger')
							},
							{
								label: m.workspace_containers_config_error(),
								value: s.configError,
								level: levelOfCount(s.configError, 'danger')
							},
							{
								label: m.workspace_containers_oom_killed(),
								value: s.oomKilled,
								level: levelOfCount(s.oomKilled, 'danger')
							}
						]
					: []
			},
			{
				title: m.workspace_health_section_rollouts(),
				size: 5,
				rows: s
					? [
							{
								label: m.deployment(),
								value: ratio(s.deployReady, s.deployDesired),
								level: rolloutLevel(s.deployReady, s.deployDesired)
							},
							{
								label: m.stateful_set(),
								value: ratio(s.stsReady, s.stsDesired),
								level: rolloutLevel(s.stsReady, s.stsDesired)
							},
							{
								label: m.daemon_set(),
								value: ratio(s.dsReady, s.dsDesired),
								level: rolloutLevel(s.dsReady, s.dsDesired)
							},
							{
								label: m.workspace_pvc_pending(),
								value: s.pvcPending,
								level: levelOfCount(s.pvcPending, 'warn')
							},
							{
								label: m.workspace_job_failed_pods(),
								value: s.jobFailed,
								level: levelOfCount(s.jobFailed, 'danger')
							}
						]
					: []
			}
		];
	});
</script>

<div class="contents">
	<div class={statsClass}>
		{#each stats as stat (stat.label)}
			<StatCard
				label={stat.label}
				icon={stat.icon}
				status={health.status}
				stale={health.stale}
				valueClass={levelText[stat.level]}
			>
				{stat.value}
			</StatCard>
		{/each}
	</div>

	{#each lists as list (list.title)}
		<div class={listClass}>
			<WidgetCard
				title={list.title}
				status={health.status}
				stale={health.stale}
				{emptyDescription}
				bodyClass="min-h-40"
			>
				{#snippet skeleton()}
					<ValueList skeleton={list.size} />
				{/snippet}
				<ValueList rows={list.rows} />
			</WidgetCard>
		</div>
	{/each}
</div>

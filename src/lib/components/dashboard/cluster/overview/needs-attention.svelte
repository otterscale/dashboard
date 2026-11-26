<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import { onDestroy, onMount } from 'svelte';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { NUM, Panel } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { describeAlert, subjectPod } from './alert-catalog';
	import { formatDuration } from './format';
	import type { ClusterSignals, FiringAlert } from './signals.svelte';

	// Firing cluster-level critical and warning alerts (alert-scope.ts), sorted by severity, then
	// oldest first. Workload alerts belong to the workspace pages.
	let { signals }: { signals: ClusterSignals } = $props();

	let now = $state(Date.now());
	let timer: ReturnType<typeof setInterval> | undefined;
	onMount(() => {
		timer = setInterval(() => (now = Date.now()), 15_000);
	});
	onDestroy(() => clearInterval(timer));

	const cardState = $derived(
		signals.status === 'loading'
			? 'loading'
			: signals.status === 'error'
				? 'error'
				: signals.status === 'empty'
					? 'empty'
					: 'ready'
	);

	type Action = { label: string; href: string };

	function detailUrl(
		name: string,
		kind: { group: string; version: string; kind: string; resource: string },
		namespace?: string
	): string {
		const query = new URLSearchParams(namespace ? { ...kind, namespace } : kind);
		return `${resolve('/(auth)/[cluster]/[workspace]/[name]', {
			cluster: page.params.cluster ?? '',
			workspace: page.params.workspace ?? '',
			name
		})}?${query}`;
	}

	const WORKLOADS = [
		['deployment', { group: 'apps', version: 'v1', kind: 'Deployment', resource: 'deployments' }],
		[
			'statefulset',
			{ group: 'apps', version: 'v1', kind: 'StatefulSet', resource: 'statefulsets' }
		],
		['daemonset', { group: 'apps', version: 'v1', kind: 'DaemonSet', resource: 'daemonsets' }],
		['job_name', { group: 'batch', version: 'v1', kind: 'Job', resource: 'jobs' }]
	] as const;

	// A node label links to the node; a namespace links to the workload it names, or to the
	// namespace's pods when the alert names none. Neither: no link.
	function actionOf(alert: FiringAlert): Action | undefined {
		const { node, namespace } = alert.labels;
		if (node) {
			return {
				label: m.alert_view_node(),
				href: detailUrl(node, { group: '', version: 'v1', kind: 'Node', resource: 'nodes' })
			};
		}
		if (!namespace) return undefined;
		// The workload first: a job or deployment alert can also carry the exporter's pod.
		for (const [label, kind] of WORKLOADS) {
			const name = alert.labels[label];
			if (name) return { label: m.alert_view_workload(), href: detailUrl(name, kind, namespace) };
		}
		const pod = subjectPod(alert.labels);
		if (pod) {
			return {
				label: m.alert_view_pod(),
				href: detailUrl(pod, { group: '', version: 'v1', kind: 'Pod', resource: 'pods' }, namespace)
			};
		}
		const query = new URLSearchParams({
			group: '',
			version: 'v1',
			kind: 'Pod',
			resource: 'pods',
			fieldSelector: `metadata.namespace==${namespace}`
		});
		return {
			label: m.alert_view_pods(),
			href: `${resolve('/(auth)/[cluster]/[workspace]', {
				cluster: page.params.cluster ?? '',
				workspace: page.params.workspace ?? ''
			})}?${query}`
		};
	}

	const items = $derived(
		signals.alerts.map((alert) => ({
			alert,
			...describeAlert(alert),
			action: actionOf(alert)
		}))
	);
</script>

<Panel
	title={m.needs_attention()}
	tooltip={m.needs_attention_tooltip()}
	state={cardState}
	class="min-h-[11.5rem]"
>
	{#snippet badge()}
		{#if cardState === 'ready'}
			<span
				class="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-xs text-muted-foreground {NUM}"
			>
				{items.length}
			</span>
		{/if}
	{/snippet}
	{#if items.length === 0}
		<div class="flex flex-1 items-center gap-3 py-2">
			<CircleCheckIcon class="size-6 shrink-0 text-chart-2" aria-hidden="true" />
			<div class="min-w-0">
				<p class="text-sm leading-5 font-[550]">{m.cluster_nothing_needs_attention()}</p>
				<p class="text-[0.8125rem] leading-5 text-muted-foreground">
					{m.cluster_no_alerts_firing()}
				</p>
			</div>
		</div>
	{:else}
		<!-- Long lists scroll inside the card so the state card beside it keeps its height. -->
		<ul class="-mx-1 max-h-[17.5rem] overflow-y-auto px-1">
			{#each items as item, index (index)}
				{@const severity = item.alert.severity}
				<li class="flex gap-3 border-b py-2.5 last:border-b-0">
					{#if severity === 'critical'}
						<CircleXIcon class="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
					{:else}
						<TriangleAlertIcon class="mt-0.5 size-4 shrink-0 text-chart-1" aria-hidden="true" />
					{/if}
					<div class="min-w-0 flex-1">
						<p class="text-sm leading-5 font-[550] break-words">
							<span class="sr-only">{severity}:</span>
							{item.title}
						</p>
						{#if item.description}
							<p class="text-[0.8125rem] leading-5 break-words text-muted-foreground">
								{item.description}
							</p>
						{/if}
					</div>
					<div
						class="flex shrink-0 flex-col items-end gap-0.5 text-xs leading-5 @lg/panel:flex-row @lg/panel:items-baseline @lg/panel:gap-3"
					>
						{#if item.alert.activeAt !== undefined}
							<span class={cn('whitespace-nowrap text-muted-foreground', NUM)}>
								{formatDuration(now / 1000 - item.alert.activeAt)}
							</span>
						{/if}
						{#if item.action}
							<!-- The href is built with resolve() in actionOf(); the query string is appended. -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								href={item.action.href}
								class="font-medium whitespace-nowrap underline-offset-4 hover:underline focus-visible:underline"
							>
								{item.action.label}
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/if}
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</Panel>

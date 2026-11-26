<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { fmt, fmtCores, fmtGiB } from '$lib/components/dashboard/cluster/analytics/lib/format';
	import { Status } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';

	import type { Entry, Quota, Totals } from './lib/model';

	// What the cards below are about: its kind, name, state and one line of facts.
	let {
		entry,
		totals,
		workloads,
		quota,
		namespace,
		loading
	}: {
		entry: Entry;
		totals: Totals | undefined;
		/** Every workload, for the workspace's "1 of 6 failing". */
		workloads: Entry[];
		quota: Quota;
		namespace: string;
		loading: boolean;
	} = $props();

	const kind = $derived(
		entry.kind === 'workspace'
			? m.workspace()
			: entry.kind === 'model'
				? m.model()
				: entry.kind === 'release'
					? m.release()
					: entry.resource === 'statefulsets'
						? m.ws_analytics_statefulset()
						: m.deployment()
	);
	const tone = $derived(
		entry.state === 'failing' ? 'bad' : entry.state === 'starting' ? 'warn' : 'ok'
	);

	const status = $derived.by(() => {
		if (entry.kind !== 'workspace') return entry.reason || m.ready();
		const total = String(workloads.length);
		if (workloads.length === 0) return m.ws_analytics_no_workloads();
		const count = (state: Entry['state']) =>
			String(workloads.filter((w) => w.state === state).length);
		if (entry.state === 'failing')
			return m.ws_analytics_failing_of({ count: count('failing'), total });
		if (entry.state === 'starting')
			return m.ws_analytics_starting_of({ count: count('starting'), total });
		return m.ws_analytics_all_ready_of({ total });
	});

	const facts = $derived.by(() => {
		if (entry.kind === 'workspace') {
			const items = [
				quota.cpu !== undefined ? m.ws_analytics_quota_cores({ value: fmtCores(quota.cpu) }) : '',
				quota.memory !== undefined ? m.ws_analytics_quota_gib({ value: fmtGiB(quota.memory) }) : '',
				quota.gpuMemory !== undefined
					? m.ws_analytics_quota_gpu({ value: fmtGiB(quota.gpuMemory) })
					: ''
			].filter(Boolean);
			return items.length > 0
				? m.ws_analytics_quota_line({ items: items.join(' · ') })
				: m.ws_analytics_no_quota();
		}
		if (!totals) return '';
		const pods =
			totals.podsTotal === 1
				? m.ws_analytics_pods_one()
				: m.ws_analytics_pods_many({ count: fmt(totals.podsTotal) });
		const cards = totals.gpu?.cards ?? 0;
		if (cards === 0) return pods;
		const gpus =
			cards === 1 ? m.ws_analytics_gpu_one() : m.ws_analytics_gpu_many({ count: fmt(cards) });
		return `${pods} · ${gpus}`;
	});

	// Model Analytics names a model `<namespace>/<name>` in its `model` parameter.
	const modelHref = $derived(
		entry.kind === 'model'
			? `${resolve('/(auth)/[cluster]/[workspace]/dashboard/model', {
					cluster: page.params.cluster ?? '',
					workspace: page.params.workspace ?? ''
				})}?${new URLSearchParams({ tab: 'analytics', model: `${namespace}/${entry.name}` })}`
			: undefined
	);
</script>

<h2 class="flex min-h-8 min-w-0 flex-wrap items-baseline gap-x-2.5 gap-y-1 pt-3">
	<span class="text-xs text-muted-foreground">{kind}</span>
	<span class="min-w-0 truncate font-mono text-xl leading-7 tracking-tight">{entry.name}</span>
	{#if loading}
		<Skeleton class="h-4 w-40 self-center" />
	{:else}
		<Status {tone} variant="dot" class="text-sm font-medium">{status}</Status>
		<span class="text-[0.8125rem] font-normal text-muted-foreground">{facts}</span>
		{#if modelHref}
			<!-- The path is built with resolve(); only the query string is appended. -->
			<!-- eslint-disable svelte/no-navigation-without-resolve -->
			<a
				href={modelHref}
				class="rounded-sm text-[0.8125rem] font-medium text-chart-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				{m.ws_analytics_open_model()}
			</a>
			<!-- eslint-enable svelte/no-navigation-without-resolve -->
		{/if}
	{/if}
</h2>

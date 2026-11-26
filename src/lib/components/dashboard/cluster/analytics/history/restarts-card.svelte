<script lang="ts">
	import CheckIcon from '@lucide/svelte/icons/check';
	import type { PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { NUM, Panel } from '$lib/components/dashboard/kit';
	import { fetchInstant, fetchRange, rangeLiteral } from '$lib/components/dashboard/kit/fetch';
	import { fmt } from '$lib/components/dashboard/kit/format';
	import { Loader } from '$lib/components/dashboard/kit/loader.svelte';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { restartBucketsQuery, restartedPodQueries } from '../lib/promql';

	// Restarts in 5-minute bars, and the pods behind them with the reason the last one stopped.
	let {
		client,
		scope,
		start,
		end,
		windowLabel,
		describe
	}: {
		client: PrometheusDriver;
		/** Left out while the page has no node or namespace yet: the card then waits in its loading state. */
		scope: { node: string } | { namespace: string } | undefined;
		start: Date;
		end: Date;
		windowLabel: string;
		/** The line under a pod's name: its workspace on a node, its node in a namespace. */
		describe: (pod: { namespace: string; node: string }) => string;
	} = $props();

	type Data = {
		buckets: { t: number; v: number }[];
		pods: { namespace: string; pod: string; node: string; reason?: string; count: number }[];
	};

	// Five-minute buckets, widened in whole multiples so a long window stays under ~96 bars.
	const STEP = $derived(
		Math.max(300, Math.ceil((end.getTime() - start.getTime()) / 1000 / 96 / 300) * 300)
	);

	const loader = new Loader<Data>(async () => {
		if (!scope) return null;
		// Buckets end on the window's end, so the last bar is the latest five minutes.
		const firstEnd = new Date(start.getTime() + STEP * 1000);
		const [range, list] = await Promise.all([
			fetchRange(client, { restarts: restartBucketsQuery(scope, STEP) }, firstEnd, end, STEP),
			fetchInstant(client, restartedPodQueries(scope, rangeLiteral(start, end)), end)
		]);
		if (!range || !list) return null;
		const reason = new Map(
			list.reason.map((s) => [`${s.labels.namespace}/${s.labels.pod}`, s.labels.reason])
		);
		const node = new Map(
			list.placement.map((s) => [`${s.labels.namespace}/${s.labels.pod}`, s.labels.node])
		);
		const byTime = new Map((range.restarts[0]?.points ?? []).map((p) => [p.t, Math.round(p.v)]));
		const buckets: Data['buckets'] = [];
		for (let t = firstEnd.getTime(); t <= end.getTime(); t += STEP * 1000) {
			const at = [...byTime.keys()].find((k) => Math.abs(k - t) < STEP * 500);
			buckets.push({ t, v: at !== undefined ? (byTime.get(at) ?? 0) : 0 });
		}
		const pods = list.restarts
			.map((s) => {
				const key = `${s.labels.namespace}/${s.labels.pod}`;
				return {
					namespace: s.labels.namespace,
					pod: s.labels.pod,
					node: node.get(key) ?? '',
					reason: reason.get(key),
					count: Math.round(s.value)
				};
			})
			.filter((p) => p.count > 0)
			.sort((a, b) => b.count - a.count || a.pod.localeCompare(b.pod));
		return { buckets, pods };
	});

	// A new window starts from the loading card; the page remounts this for a new node or namespace.
	$effect(() => {
		void [start.getTime(), end.getTime()];
		if (!scope) return;
		untrack(() => {
			loader.reset();
			loader.load();
		});
	});

	const total = $derived((loader.data?.pods ?? []).reduce((s, p) => s + p.count, 0));
	const max = $derived(Math.max(1, ...(loader.data?.buckets ?? []).map((b) => b.v)));
	const ticks = $derived.by(() => {
		const b = loader.data?.buckets ?? [];
		if (b.length === 0) return [];
		const n = Math.min(5, b.length);
		return Array.from(
			{ length: n },
			(_, i) => b[Math.round((i * (b.length - 1)) / Math.max(1, n - 1))]
		);
	});
	const time = (t: number) =>
		new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
</script>

<Panel title={m.analytics_pod_restarts()} state={loader.state} class="min-h-40">
	{#snippet actions()}
		{#if loader.state === 'ready'}
			<span class="mt-1.5 mr-1 text-xs text-muted-foreground">
				{m.analytics_in_the_range({ count: fmt(total) })}
			</span>
		{/if}
	{/snippet}
	{#if total === 0}
		<p class="flex items-center gap-2 text-sm">
			<CheckIcon class="size-4 text-chart-2" aria-hidden="true" />
			{m.analytics_no_restarts({ window: windowLabel })}
		</p>
	{:else}
		<div class="grid gap-x-8 gap-y-5 @3xl/panel:grid-cols-2">
			<div>
				<div class="flex h-24 items-end gap-[3px]" aria-hidden="true">
					{#each loader.data?.buckets ?? [] as bucket (bucket.t)}
						<span
							class={cn(
								'min-w-px flex-1 rounded-t-[2px]',
								bucket.v > 0 ? 'bg-chart-4' : 'bg-muted'
							)}
							style:height="{bucket.v > 0 ? Math.max(8, (bucket.v / max) * 100) : 2}%"
							title="{time(bucket.t)} · {bucket.v}"
						></span>
					{/each}
				</div>
				<div class={cn('mt-2 flex justify-between text-[11px] text-muted-foreground', NUM)}>
					{#each ticks as tick (tick.t)}
						<span>{time(tick.t)}</span>
					{/each}
				</div>
			</div>
			<div class="min-w-0">
				<p class="text-xs text-muted-foreground">{m.analytics_restarted_pods()}</p>
				<ul class="mt-1">
					{#each loader.data?.pods ?? [] as pod (pod.namespace + '/' + pod.pod)}
						<li
							class="flex items-center justify-between gap-3 border-b border-border py-2 last:border-b-0"
						>
							<span class="min-w-0">
								<span class="block truncate font-mono text-xs" title={pod.pod}>{pod.pod}</span>
								<span class="block truncate text-xs text-muted-foreground">
									{describe(pod)}{pod.reason
										? ` · ${m.analytics_last_reason({ reason: pod.reason })}`
										: ''}
								</span>
							</span>
							<span class={cn('shrink-0 text-sm font-[550]', NUM)}>{fmt(pod.count)}</span>
						</li>
					{/each}
				</ul>
			</div>
		</div>
	{/if}
</Panel>

<script lang="ts">
	import type { InstantVector, PrometheusDriver } from 'prometheus-query';
	import { untrack } from 'svelte';

	import { fetchInstant, scalar } from '$lib/components/dashboard/cluster/analytics/lib/fetch';
	import { Loader } from '$lib/components/dashboard/cluster/analytics/lib/loader.svelte';
	import { NUM, Panel } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { classifyThreshold, type SharedMetrics } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { DASH, fmtCount, type Tone } from '../overview/lib/models';
	import type { ModelPods } from './lib/model-pods';
	import { healthQueries, splitKey } from './lib/queries';
	import { TONE_TEXT } from './lib/ranking';

	// Health: faults in the last 24 hours across every pod of the model. Zero is healthy, anything
	// more is worth a look. Preemptions are not faults (vLLM's own back-pressure), so they sit with
	// the KV cache instead.
	let {
		client,
		shared,
		modelKey,
		model,
		modelState
	}: {
		client: PrometheusDriver;
		shared: SharedMetrics;
		modelKey: string;
		model: ModelPods | undefined;
		modelState: 'loading' | 'ready' | 'error';
	} = $props();

	type Health = {
		restarts?: number;
		oom?: number;
		throttle?: number;
		shm?: number;
		/** XID errors on the model's cards; undefined when they could not be read. */
		xid?: number;
	};

	type Vec = { metric: { labels: Record<string, string> }; value?: { value: unknown } };

	/**
	 * XID errors from the shared scope, per card of the model's nodes. When HAMi names the model's
	 * cards, only those count; otherwise every card of its nodes does.
	 */
	async function xidErrors(): Promise<number | undefined> {
		const pods = model?.pods ?? [];
		const nodes = [...new Set(pods.map((p) => p.node).filter((n): n is string => !!n))];
		if (nodes.length === 0) return 0;
		const uuids = new Set(pods.flatMap((p) => p.hami.map((d) => d.uuid)));
		try {
			const [byGpu, inventory] = await Promise.all([
				shared.instant('gpu-xid-by-gpu', { hostname: nodes }),
				uuids.size > 0 ? shared.instant('gpu-inventory') : Promise.resolve(undefined)
			]);
			// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
			const cards = new Set<string>();
			for (const s of (inventory?.result ?? []) as Vec[]) {
				const { UUID, hostname, device } = s.metric.labels;
				if (UUID && uuids.has(UUID) && hostname && device) {
					cards.add(`${hostname}/${device.replace(/^nvidia/, '')}`);
				}
			}
			let total = 0;
			for (const s of byGpu.result as InstantVector[]) {
				const labels = s.metric.labels as Record<string, string>;
				const value = Number(s.value?.value);
				if (!Number.isFinite(value)) continue;
				if (cards.size > 0 && !cards.has(`${labels.hostname}/${labels.gpu}`)) continue;
				total += value;
			}
			return Math.round(total);
		} catch (error) {
			console.warn('XID errors are unavailable:', error);
			return undefined;
		}
	}

	const loader = new Loader<Health>(async () => {
		if (!model) return null;
		const { namespace } = splitKey(modelKey);
		const names = model.pods.map((p) => p.name);
		const [r, xid] = await Promise.all([
			fetchInstant(client, healthQueries(namespace, names, model.container)),
			xidErrors()
		]);
		if (!r) return null;
		return {
			restarts: Math.round(scalar(r.restarts) ?? 0),
			oom: Math.round(scalar(r.oom) ?? 0),
			throttle: scalar(r.throttle),
			shm: Math.round(scalar(r.shm) ?? 0),
			xid
		};
	});

	$effect(() => {
		// The pod list is read again on every auto update, so a new list is the cue to refetch.
		void model;
		if (model) untrack(() => loader.load());
	});

	const state = $derived(
		modelState === 'loading' || (model && loader.state === 'loading')
			? 'loading'
			: modelState === 'error'
				? 'error'
				: loader.state
	);
	const h = $derived(loader.data ?? {});

	function countTone(v: number | undefined): Tone {
		if (v === undefined) return 'muted';
		return v > 0 ? 'warn' : 'ok';
	}
	function throttleTone(v: number | undefined): Tone {
		if (v === undefined) return 'muted';
		const level = classifyThreshold(v, { green: 5, orange: 25 });
		return level === 'green' ? 'ok' : level === 'orange' ? 'warn' : 'bad';
	}

	const items = $derived([
		{
			label: m.model_analytics_health_restarts(),
			value: fmtCount(h.restarts),
			tone: countTone(h.restarts)
		},
		{ label: m.model_analytics_health_oom(), value: fmtCount(h.oom), tone: countTone(h.oom) },
		{ label: m.model_analytics_health_xid(), value: fmtCount(h.xid), tone: countTone(h.xid) },
		{
			label: m.model_analytics_health_cpu_throttling(),
			value: h.throttle === undefined ? DASH : `${h.throttle.toFixed(h.throttle < 10 ? 1 : 0)}%`,
			tone: throttleTone(h.throttle)
		},
		{ label: m.model_analytics_health_shm(), value: fmtCount(h.shm), tone: countTone(h.shm) }
	]);
</script>

<!-- Five rows of 36px, like the configuration beside it, so the two cards are the same height. -->
<Panel
	title={m.model_analytics_health()}
	state={state === 'loading' ? 'ready' : state}
	class="h-full"
>
	{#snippet actions()}
		<span class="mt-1 mr-1.5 text-right text-xs text-muted-foreground">
			{m.model_analytics_health_note()}
		</span>
	{/snippet}
	<ul class="flex flex-col text-[0.8125rem]">
		{#each items as item (item.label)}
			<li class="flex h-9 items-center justify-between gap-3 border-b">
				<span class="min-w-0 truncate">{item.label}</span>
				{#if state === 'loading'}
					<Skeleton class="h-3 w-8" />
				{:else}
					<!-- The number's colour is the status: healthy at 0, a warning above. -->
					<span class={cn('text-[0.8125rem]', NUM, TONE_TEXT[item.tone])}>{item.value}</span>
				{/if}
			</li>
		{/each}
	</ul>
</Panel>

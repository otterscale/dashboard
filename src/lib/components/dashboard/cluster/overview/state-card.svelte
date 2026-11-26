<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import type { ClusterSignals } from './signals.svelte';

	// Healthy (mint) or Degraded (attention), from the firing alerts and node readiness. A failed query
	// is neither: it says it couldn't load rather than defaulting to Healthy.
	let { signals }: { signals: ClusterSignals } = $props();

	const ready = $derived(signals.status === 'ready');
	const degraded = $derived(ready && signals.isDegraded);
	const tone = $derived(!ready ? 'default' : degraded ? 'ink' : 'mint');

	const counts = $derived.by(() => {
		// Only critical and warning reach `signals.alerts` (alert-scope.ts), so there is no info.
		const out = { critical: 0, warning: 0 };
		for (const alert of signals.alerts) {
			if (alert.severity === 'critical') out.critical += 1;
			else out.warning += 1;
		}
		return out;
	});

	const nodesLine = $derived(
		signals.allReady && signals.nodes.length === 1
			? m.cluster_one_node_ready()
			: signals.allReady
				? m.cluster_all_nodes_ready({ total: String(signals.nodes.length) })
				: m.cluster_nodes_ready({
						ready: String(signals.readyCount),
						total: String(signals.nodes.length)
					})
	);
	const itemsLine = $derived(
		signals.alerts.length === 0
			? m.cluster_nothing_needs_attention()
			: signals.alerts.length === 1
				? m.cluster_one_item_needs_attention()
				: m.cluster_items_need_attention({ count: String(signals.alerts.length) })
	);

	const muted = $derived(
		tone === 'ink'
			? 'text-attention-muted'
			: tone === 'mint'
				? 'text-mint-foreground/75'
				: 'text-muted-foreground'
	);
	const pill = $derived(
		cn(
			'inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs whitespace-nowrap slashed-zero tabular-nums',
			tone === 'ink'
				? 'bg-attention-foreground/10 text-attention-foreground'
				: 'bg-card/60 text-mint-foreground'
		)
	);
</script>

<Card.Root
	class={cn(
		'h-full min-h-[11.5rem] justify-between gap-6 rounded-2xl p-4 shadow-(--card-frame) ring-0 @md:px-5 @md:py-[1.125rem]',
		tone === 'ink' &&
			'bg-attention text-attention-foreground shadow-none dark:shadow-(--card-frame)',
		tone === 'mint' && 'bg-mint text-mint-foreground shadow-none'
	)}
	aria-live="polite"
>
	<div class="min-w-0">
		<p class={cn('text-xs leading-4 font-[450]', muted)}>{m.cluster_state()}</p>
		{#if signals.status === 'loading'}
			<Skeleton class="mt-2 h-11 w-44" />
			<Skeleton class="mt-2 h-4 w-60" />
		{:else if signals.status === 'error' || signals.status === 'empty'}
			<!-- The same empty and error state as every other card on the page. -->
			<p class="mt-3 text-[1.75rem] leading-8 text-muted-foreground" aria-hidden="true">—</p>
			<p class="text-xs leading-4 text-muted-foreground">
				{signals.status === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
			</p>
		{:else}
			<p
				class="mt-1 flex items-center gap-3 text-[2.5rem] leading-[2.75rem] font-[350] tracking-tight"
			>
				<span
					class={cn(
						'size-3 shrink-0 rounded-full',
						degraded ? (counts.critical > 0 ? 'bg-destructive' : 'bg-chart-1') : 'bg-chart-2'
					)}
					aria-hidden="true"
				></span>
				{degraded ? m.cluster_state_degraded() : m.cluster_state_healthy()}
			</p>
			<p class={cn('mt-1 text-sm leading-5 slashed-zero tabular-nums', muted)}>
				{nodesLine} · {itemsLine}
			</p>
		{/if}
	</div>
	<div class="flex min-h-6 flex-wrap gap-1.5">
		{#if ready}
			{#if signals.alerts.length === 0}
				<span class={pill}>
					<span class="size-2 rounded-full bg-chart-2" aria-hidden="true"></span>
					{m.cluster_alerts_firing_none()}
				</span>
			{:else}
				<span class={pill}>
					<span class="size-2 rounded-full bg-destructive" aria-hidden="true"></span>
					{counts.critical}
					{m.alert_severity_critical()}
				</span>
				<span class={pill}>
					<span class="size-2 rounded-full bg-chart-1" aria-hidden="true"></span>
					{counts.warning}
					{m.alert_severity_warning()}
				</span>
			{/if}
		{/if}
	</div>
</Card.Root>

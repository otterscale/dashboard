<script lang="ts">
	import { m } from '$lib/messages';

	import type { ClusterSignals } from './signals.svelte';

	// The facts under the title: how the cluster is built and what it runs; how fresh the page is
	// sits in the refresh control beside the tabs. Each drops out on its own when it isn't
	// reported, so the line never holds a placeholder. Release is left out until the backend
	// reports one: Prometheus has no OtterScale version.
	let { signals }: { signals: ClusterSignals } = $props();

	const total = $derived(signals.nodes.length);
	const topology = $derived.by(() => {
		if (total === 0) return undefined;
		if (total === 1) return m.cluster_single_node();
		return `${m.cluster_multi_node()} · ${m.cluster_masters_workers({
			masters: String(signals.masterCount),
			workers: String(total - signals.masterCount)
		})}`;
	});
</script>

<!-- Each fact carries its separator, so a wrapped line never ends on a dangling dot. -->
{#if topology}
	<span class="flex items-baseline gap-2 whitespace-nowrap">
		<span aria-hidden="true">·</span>{topology}
	</span>
{/if}
{#if signals.kubernetesVersion}
	<span class="flex max-w-full min-w-0 items-baseline gap-2" title={signals.kubernetesPlatform}>
		<span aria-hidden="true">·</span>
		<span class="shrink-0">{m.kubernetes()}</span>
		<span class="min-w-0 truncate font-mono text-[0.8125rem] text-foreground">
			{signals.kubernetesVersion}
		</span>
	</span>
{/if}

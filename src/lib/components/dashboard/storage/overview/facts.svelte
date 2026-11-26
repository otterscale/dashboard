<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';
	import { onMount } from 'svelte';

	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';

	import { parseCephVersion } from './ceph';
	import { osdsLabel } from './format';
	import { InstantPoll } from './poll.svelte';
	import { HEADER_QUERIES } from './queries';
	import { first, labelsOf } from './vectors';

	// The line under the title: which Ceph, which release, and how many hosts and OSDs. Fetched
	// once; these change on the scale of days.
	let { client }: { client: PrometheusDriver } = $props();

	const poll = new InstantPoll(() => client, HEADER_QUERIES);
	onMount(() => void poll.fetch());

	const name = $derived.by(() => {
		const labels = labelsOf(poll.data, 'name')[0];
		return labels?.cluster ?? labels?.namespace;
	});
	const version = $derived(parseCephVersion(labelsOf(poll.data, 'version')[0]?.ceph_version));
	const hosts = $derived(first(poll.data, 'hosts'));
	const osds = $derived(first(poll.data, 'osds'));
	const facts = $derived(
		[
			version ? [version.release, version.version].filter(Boolean).join(' ') : undefined,
			hosts === undefined
				? undefined
				: hosts === 1
					? m.storage_hosts_one()
					: m.storage_hosts({ count: String(hosts) }),
			osds === undefined ? undefined : osdsLabel(osds)
		].filter((fact): fact is string => fact !== undefined)
	);
</script>

<!-- Wraps between facts, never inside one; a fact too long for the line truncates. -->
<div
	class="mt-0.5 flex min-h-5 min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm text-muted-foreground"
>
	<span class="flex max-w-full min-w-0 items-baseline gap-1.5">
		<span class="shrink-0">Ceph</span>
		{#if name}
			<span class="min-w-0 truncate font-mono text-[0.8125rem] text-foreground" title={name}>
				{name}
			</span>
		{/if}
	</span>
	{#if !poll.loaded}
		<Skeleton class="h-3.5 w-40 self-center" />
	{:else}
		{#each facts as fact (fact)}
			<span class="whitespace-nowrap" aria-hidden="true">·</span>
			<span class="whitespace-nowrap slashed-zero tabular-nums">{fact}</span>
		{/each}
	{/if}
</div>

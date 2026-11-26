<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import { Tile } from '$lib/components/dashboard/kit';
	import type { RankMetric } from '$lib/components/dashboard/kit/ranking-card.svelte';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';

	import NamespaceHistory from './history/namespace-history.svelte';
	import NodeHistory from './history/node-history.svelte';
	import { WorkspacePalette } from './lib/workspaces';
	import NamespaceNow from './namespace/namespace-now.svelte';
	import NamespaceRanking from './namespace/namespace-ranking.svelte';
	import NodeKpis from './node/node-kpis.svelte';
	import NodeRanking from './node/node-ranking.svelte';
	import Occupancy from './node/occupancy.svelte';

	// The Analytics tab. Top to bottom: a ranking that is also the picker, then the picked node or
	// namespace, as it is now or over the chosen window.
	let {
		client,
		view,
		history,
		selectedNode = $bindable(),
		selectedNamespace = $bindable(),
		start,
		end,
		windowLabel,
		tick
	}: {
		client: PrometheusDriver;
		view: 'node' | 'namespace';
		history: boolean;
		selectedNode: string | undefined;
		selectedNamespace: string | undefined;
		start: Date;
		end: Date;
		/** "the last 1 h", or the fixed span, for the History copy. */
		windowLabel: string;
		/** Bumped by the page's Auto update timer; Now cards refetch on it. */
		tick: number;
	} = $props();

	const transport = getContext<Transport>('transport');
	const resourceClient = createClient(ResourceService, transport);

	// namespace → workspace (a Workspace owns one namespace through `spec.namespace`).
	let namespaceToWorkspace = $state<Record<string, string>>({});
	const palette = $derived(new WorkspacePalette(namespaceToWorkspace));

	// node_exporter keys a node by `instance`; node_uname_info maps the two.
	let nodeToInstance = $state<Record<string, string>>({});
	// Node detail waits for that map, so its node_exporter cards load once, with the right instance.
	let instancesKnown = $state(false);

	onMount(() => {
		resourceClient
			.list({
				cluster: page.params.cluster ?? '',
				group: 'tenant.otterscale.io',
				version: 'v1alpha1',
				resource: 'workspaces',
				namespace: ''
			})
			.then((response) => {
				const map: Record<string, string> = {};
				for (const item of response.items) {
					const obj = item.object as Record<string, unknown> | undefined;
					const name = (obj?.metadata as Record<string, unknown> | undefined)?.name;
					const ns = (obj?.spec as Record<string, unknown> | undefined)?.namespace;
					if (typeof name === 'string' && typeof ns === 'string' && name && ns) map[ns] = name;
				}
				namespaceToWorkspace = map;
			})
			.catch((error) => console.error('Failed to list workspaces:', error));
		client
			.instantQuery('node_uname_info')
			.then((response) => {
				const map: Record<string, string> = {};
				for (const s of response.result as { metric: { labels: Record<string, string> } }[]) {
					const { nodename, instance } = s.metric.labels;
					if (nodename && instance) map[nodename] = instance;
				}
				nodeToInstance = map;
			})
			.catch(() => (nodeToInstance = {}))
			.finally(() => (instancesKnown = true));
	});

	let nodeMetric = $state<RankMetric>('cpu');
	let namespaceMetric = $state<RankMetric>('cpu');

	let nodes = $state.raw<{ name: string; roles: string[]; gpus: number }[]>([]);
	// Until a ranking answers, the detail holds its place with a skeleton; an empty answer clears it.
	let nodesAnswered = $state(false);
	let namespacesAnswered = $state(false);
	function onNodes(list: typeof nodes) {
		nodes = list;
		nodesAnswered = true;
		if (list.length > 0 && (!selectedNode || !list.some((n) => n.name === selectedNode))) {
			selectedNode = list[0].name;
		}
	}
	function onNamespaces(list: string[]) {
		namespacesAnswered = true;
		if (list.length > 0 && (!selectedNamespace || !list.includes(selectedNamespace))) {
			selectedNamespace = list[0];
		}
	}

	const current = $derived(nodes.find((n) => n.name === selectedNode));
	const nodeChips = $derived.by(() => {
		if (!current) return [];
		const list: string[] = [];
		if (current.roles.some((r) => r === 'control-plane' || r === 'master'))
			list.push(m.analytics_chip_master());
		list.push(current.gpus > 0 ? m.analytics_chip_gpu() : m.analytics_chip_cpu());
		return list;
	});
	const rangeKey = $derived(`${start.getTime()}-${end.getTime()}`);
</script>

{#snippet heading(label: string, name: string | undefined, chips: string[])}
	<h2
		class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 pt-3 text-xl leading-7 font-[450] tracking-tight"
	>
		{label}
		{#if name}
			<span
				class="min-w-0 truncate font-mono text-sm font-normal text-muted-foreground"
				title={name}>{name}</span
			>
			{#each chips as chip (chip)}
				<span
					class="self-center rounded-full bg-muted px-2 py-0.5 text-xs leading-4 font-normal text-muted-foreground"
				>
					{chip}
				</span>
			{/each}
		{/if}
	</h2>
{/snippet}

{#snippet pending()}
	<!-- Same footprint as the Now detail, while the ranking or the node map is still loading. -->
	<div class="grid grid-cols-1 gap-2 @sm:grid-cols-2 @md:gap-3 @2xl:grid-cols-3 @5xl:grid-cols-5">
		{#each [m.analytics_cpu_usage(), m.analytics_memory_usage(), m.analytics_gpu_memory_allocated(), m.analytics_pods(), m.analytics_file_system()] as label (label)}
			<Tile {label} state="loading" />
		{/each}
	</div>
	<Skeleton class="h-[40rem] w-full rounded-2xl bg-card shadow-(--card-frame)" />
{/snippet}

<div class="flex flex-col gap-2 @md:gap-3">
	{#if view === 'node'}
		<NodeRanking
			{client}
			{tick}
			{history}
			{start}
			{end}
			{windowLabel}
			bind:metric={nodeMetric}
			selected={selectedNode}
			onSelect={(node) => (selectedNode = node)}
			{onNodes}
		/>
		{@render heading(m.analytics_node_detail(), selectedNode, nodeChips)}
		{#if selectedNode && instancesKnown}
			{#key selectedNode}
				{#if history}
					{#key rangeKey}
						<NodeHistory
							{client}
							node={selectedNode}
							instance={nodeToInstance[selectedNode]}
							hasGpu={(current?.gpus ?? 0) > 0}
							{start}
							{end}
							{windowLabel}
							{palette}
						/>
					{/key}
				{:else}
					<NodeKpis {client} {tick} node={selectedNode} instance={nodeToInstance[selectedNode]} />
					<Occupancy {client} {tick} node={selectedNode} {palette} />
				{/if}
			{/key}
		{:else if !nodesAnswered || selectedNode}
			{@render pending()}
		{/if}
	{:else}
		<NamespaceRanking
			{client}
			{tick}
			{history}
			{start}
			{end}
			{windowLabel}
			bind:metric={namespaceMetric}
			selected={selectedNamespace}
			onSelect={(ns) => (selectedNamespace = ns)}
			{onNamespaces}
			{namespaceToWorkspace}
		/>
		{@render heading(
			m.analytics_namespace_detail(),
			selectedNamespace,
			selectedNamespace
				? [
						namespaceToWorkspace[selectedNamespace]
							? m.analytics_chip_workspace()
							: m.analytics_chip_system()
					]
				: []
		)}
		{#if selectedNamespace}
			{#key selectedNamespace}
				{#if history}
					{#key rangeKey}
						<NamespaceHistory {client} namespace={selectedNamespace} {start} {end} {windowLabel} />
					{/key}
				{:else}
					<NamespaceNow {client} {tick} namespace={selectedNamespace} />
				{/if}
			{/key}
		{:else if !namespacesAnswered}
			{@render pending()}
		{/if}
	{/if}
</div>

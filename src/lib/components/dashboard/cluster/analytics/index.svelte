<script lang="ts">
	import { createClient, type Transport } from '@connectrpc/connect';
	import { ResourceService } from '@otterscale/api/resource/v1';
	import type { PrometheusDriver } from 'prometheus-query';
	import { getContext, onMount } from 'svelte';

	import { page } from '$app/state';
	import { Chip } from '$lib/components/dashboard/kit';
	import type { RankMetric } from '$lib/components/dashboard/kit/ranking-card.svelte';
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
	let namespaceToWorkspace = $state.raw<Record<string, string>>({});
	const palette = $derived(new WorkspacePalette(namespaceToWorkspace));

	// node_exporter keys a node by `instance`; node_uname_info maps the two.
	let nodeToInstance = $state.raw<Record<string, string>>({});
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

	let nodes = $state.raw<{ name: string; chips: string[]; gpus: number }[]>([]);
	// Until a ranking answers, the detail is mounted with nothing to ask about, so it shows its own
	// loading cards and no label changes when the numbers arrive. An empty answer, or a failed one,
	// clears it: the ranking card says which.
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
	// The node the detail asks about: none until one is picked and the instance map is in.
	const nodeSubject = $derived(instancesKnown ? selectedNode : undefined);
	const instance = $derived(nodeSubject ? nodeToInstance[nodeSubject] : undefined);
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
				<Chip class="self-center">{chip}</Chip>
			{/each}
		{/if}
	</h2>
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
		{@render heading(m.analytics_node_detail(), selectedNode, current?.chips ?? [])}
		{#if selectedNode || !nodesAnswered}
			<!-- A new node starts from its loading cards; a new window reloads the cards in place. -->
			{#key nodeSubject}
				{#if history}
					<NodeHistory
						{client}
						node={nodeSubject}
						{instance}
						hasGpu={(current?.gpus ?? 0) > 0}
						{start}
						{end}
						{windowLabel}
						{palette}
					/>
				{:else}
					<NodeKpis {client} {tick} node={nodeSubject} {instance} />
					<Occupancy {client} {tick} node={nodeSubject} {palette} />
				{/if}
			{/key}
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
		{#if selectedNamespace || !namespacesAnswered}
			{#key selectedNamespace}
				{#if history}
					<NamespaceHistory {client} namespace={selectedNamespace} {start} {end} {windowLabel} />
				{:else}
					<NamespaceNow {client} {tick} namespace={selectedNamespace} />
				{/if}
			{/key}
		{/if}
	{/if}
</div>

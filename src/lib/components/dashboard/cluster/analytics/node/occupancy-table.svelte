<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';

	import { NUM } from '$lib/components/dashboard/kit';
	import {
		DASH,
		fmt,
		fmtCores,
		fmtGiB,
		fmtGpuGiB,
		sum
	} from '$lib/components/dashboard/kit/format';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { type Measure, type OccupancyPod, podValue, type Resource } from './occupancy-types';

	// Every number the map shows, by workspace. The map is for shape; this is where the values are
	// read, including by keyboard and at widths where the map is hidden.
	let {
		pods,
		resource,
		measure,
		capacity,
		groupName
	}: {
		pods: OccupancyPod[];
		resource: Resource;
		measure: Measure;
		capacity: number | undefined;
		groupName: (id: string) => string;
	} = $props();

	type Group = { id: string; color: string; pods: OccupancyPod[] };

	const groups = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
		const map = new Map<string, Group>();
		for (const p of pods) {
			const g = map.get(p.group.id) ?? { id: p.group.id, color: p.group.color, pods: [] };
			g.pods.push(p);
			map.set(p.group.id, g);
		}
		const total = (g: Group) => sum(g.pods.map((p) => podValue(p, resource, measure)));
		const list = [...map.values()].sort((a, b) => total(b) - total(a) || a.id.localeCompare(b.id));
		for (const g of list) {
			g.pods.sort(
				(a, b) =>
					podValue(b, resource, measure) - podValue(a, resource, measure) ||
					a.pod.localeCompare(b.pod)
			);
		}
		return list;
	});

	let open = $state<Record<string, boolean>>({});
	// Every workspace starts collapsed; the map above already shows which is largest.
	const isOpen = (id: string) => open[id] ?? false;

	const share = (v: number) => (capacity ? fmt((v / capacity) * 100, 1) + '%' : DASH);
	// The column the map is drawn from reads in bold.
	const bold = (r: Resource, ms: Measure) =>
		r === resource && ms === measure && 'font-[650] text-foreground';
	const optional = (values: (number | undefined)[]) =>
		values.some((v) => v !== undefined)
			? sum(values.filter((v): v is number => v !== undefined))
			: undefined;

	type Values = {
		cpu: [number, number, number];
		memory: [number, number, number];
		gpuUsed: number | undefined;
		gpuAllocated: number | undefined;
	};
	function totals(list: OccupancyPod[]): Values {
		return {
			cpu: [0, 1, 2].map((i) => sum(list.map((p) => p.cpu[i]))) as [number, number, number],
			memory: [0, 1, 2].map((i) => sum(list.map((p) => p.memory[i]))) as [number, number, number],
			gpuUsed: optional(list.map((p) => p.gpuUsed)),
			gpuAllocated: optional(list.map((p) => p.gpuAllocated))
		};
	}
	const gpu = (v: number | undefined) => (v === undefined || v === 0 ? DASH : fmtGpuGiB(v));
	// The vendored table at this card's density: 13px, tighter rows, no row hover.
	const ROW = 'border-border/60 hover:bg-transparent';
	const GROUP_HEAD = 'h-auto border-l border-border px-3 pt-2 font-[550] whitespace-normal';
	const HEAD = 'h-auto px-3 py-2 text-right whitespace-normal text-muted-foreground';
	const CELL = 'px-3 py-2.5 text-right';
	const DIVIDED = 'border-l border-border';
</script>

{#snippet numbers(v: Values)}
	<Table.Cell class={cn(CELL, DIVIDED, bold('cpu', 'usage'))}>{fmtCores(v.cpu[0])}</Table.Cell>
	<Table.Cell class={cn(CELL, bold('cpu', 'request'))}>{fmtCores(v.cpu[1])}</Table.Cell>
	<Table.Cell class={cn(CELL, bold('cpu', 'limit'))}>{fmtCores(v.cpu[2])}</Table.Cell>
	<Table.Cell class={cn(CELL, DIVIDED, bold('memory', 'usage'))}>{fmtGiB(v.memory[0])}</Table.Cell>
	<Table.Cell class={cn(CELL, bold('memory', 'request'))}>{fmtGiB(v.memory[1])}</Table.Cell>
	<Table.Cell class={cn(CELL, bold('memory', 'limit'))}>{fmtGiB(v.memory[2])}</Table.Cell>
	<Table.Cell class={cn(CELL, DIVIDED, bold('gpu', 'usage'))}>{gpu(v.gpuUsed)}</Table.Cell>
	<Table.Cell class={cn(CELL, bold('gpu', 'allocated'))}>{gpu(v.gpuAllocated)}</Table.Cell>
{/snippet}

<Table.Root class={cn('min-w-[56rem] border-collapse text-[0.8125rem]', NUM)}>
	<Table.Header class="text-xs text-muted-foreground">
		<!-- The group names sit on the column names: no rule between the two header rows. -->
		<Table.Row class="border-b-0! hover:bg-transparent">
			<Table.Head class="h-auto px-3 pt-2" colspan={2}></Table.Head>
			<Table.Head class={GROUP_HEAD} colspan={3}>
				{m.analytics_cpu()}
				<span class="font-normal text-muted-foreground">{m.analytics_unit_cores()}</span>
			</Table.Head>
			<Table.Head class={GROUP_HEAD} colspan={3}>
				{m.analytics_memory()}
				<span class="font-normal text-muted-foreground">{m.analytics_unit_gib()}</span>
			</Table.Head>
			<Table.Head class={GROUP_HEAD} colspan={2}>
				{m.analytics_gpu()}
				<span class="font-normal text-muted-foreground">{m.analytics_unit_gib()}</span>
			</Table.Head>
		</Table.Row>
		<Table.Row class="hover:bg-transparent">
			<Table.Head class={cn(HEAD, 'text-left')}>{m.analytics_workspace_pod()}</Table.Head>
			<Table.Head class={HEAD}>{m.analytics_share()}</Table.Head>
			<Table.Head class={cn(HEAD, DIVIDED)}>{m.analytics_usage()}</Table.Head>
			<Table.Head class={HEAD}>{m.analytics_request()}</Table.Head>
			<Table.Head class={HEAD}>{m.analytics_limit()}</Table.Head>
			<Table.Head class={cn(HEAD, DIVIDED)}>{m.analytics_usage()}</Table.Head>
			<Table.Head class={HEAD}>{m.analytics_request()}</Table.Head>
			<Table.Head class={HEAD}>{m.analytics_limit()}</Table.Head>
			<Table.Head class={cn(HEAD, DIVIDED)}>{m.analytics_usage()}</Table.Head>
			<Table.Head class={HEAD}>{m.analytics_allocated()}</Table.Head>
		</Table.Row>
	</Table.Header>
	{#each groups as group (group.id)}
		{@const expanded = isOpen(group.id)}
		{@const t = totals(group.pods)}
		<!-- One body per workspace: a full rule between workspaces, a faint one between its rows. -->
		<Table.Body class="border-b border-border last:border-b-0">
			<Table.Row class={ROW}>
				<Table.Cell class="py-1 pr-3 pl-0">
					<!-- The ring is drawn inside: the table's scroll container would clip an outer one. -->
					<button
						type="button"
						class="flex min-h-9 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
						aria-expanded={expanded}
						onclick={() => (open[group.id] = !expanded)}
					>
						<ChevronRightIcon
							class={cn(
								'size-4 shrink-0 text-muted-foreground transition-transform',
								expanded && 'rotate-90'
							)}
						/>
						<span class="size-2.5 shrink-0 rounded-[2px]" style:background={group.color}></span>
						<span class="truncate font-[550]">{groupName(group.id)}</span>
						<span class="shrink-0 text-xs text-muted-foreground">
							{m.analytics_pod_count({ count: String(group.pods.length) })}
						</span>
					</button>
				</Table.Cell>
				<Table.Cell class={CELL}>
					{share(sum(group.pods.map((p) => podValue(p, resource, measure))))}
				</Table.Cell>
				{@render numbers(t)}
			</Table.Row>
			{#if expanded}
				{#each group.pods as pod (pod.key)}
					<Table.Row class={ROW}>
						<Table.Cell class="max-w-[16rem] py-2.5 pr-3 pl-10">
							<span class="block truncate font-mono text-xs" title="{pod.namespace}/{pod.pod}"
								>{pod.pod}</span
							>
						</Table.Cell>
						<Table.Cell class={CELL}>{share(podValue(pod, resource, measure))}</Table.Cell>
						{@render numbers(pod)}
					</Table.Row>
				{/each}
			{/if}
		</Table.Body>
	{/each}
</Table.Root>

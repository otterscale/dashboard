<script lang="ts">
	import { NUM, Panel, Status, type WidgetState } from '$lib/components/dashboard/kit';
	import { DASH, fmt, fmtCores, fmtGiB } from '$lib/components/dashboard/kit/format';
	import { splitTail } from '$lib/components/dashboard/model/analytics/lib/pods';
	import * as Table from '$lib/components/ui/table';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { detailLink, POD } from '../overview/links';
	import OverviewLink from '../overview/overview-link.svelte';
	import { type PodNow, podStatus, sortPods } from './lib/model';

	// The selected row's pods, the ones with trouble first. A pod's name opens the pod.
	let {
		pods,
		namespace,
		wholeWorkspace,
		state
	}: {
		pods: PodNow[];
		namespace: string;
		wholeWorkspace: boolean;
		state: WidgetState;
	} = $props();

	const sorted = $derived(sortPods(pods));
	// The vendored table's density, tightened to this card's: shorter header, 13px rows.
	const th = 'h-auto px-2.5 py-2 text-muted-foreground';
	const td = 'px-2.5 py-2.5';
	// Neither number known, a pod still in its init containers for example: one dash, not two.
	const pair = (used: string, of: string, unit = '') =>
		used === DASH && of === DASH ? DASH : `${used} / ${of}${unit ? ` ${unit}` : ''}`;
</script>

{#snippet name(full: string, width: string, className: string)}
	{@const [head, tail] = splitTail(full, 2)}
	<Tooltip.Root>
		<Tooltip.Trigger>
			{#snippet child({ props })}
				<span {...props} class={cn('flex min-w-0 font-mono text-xs', width, className)}>
					<span class="truncate">{head}</span><span class="shrink-0">{tail}</span>
				</span>
			{/snippet}
		</Tooltip.Trigger>
		<Tooltip.Content side="top" align="start" class="max-w-none">
			<p class="font-mono text-xs whitespace-nowrap">{full}</p>
		</Tooltip.Content>
	</Tooltip.Root>
{/snippet}

<Panel
	title={m.analytics_pods()}
	state={state === 'ready' && pods.length === 0 ? 'empty' : state}
	class="min-h-40"
>
	{#snippet actions()}
		<span class="mt-1.5 mr-1 text-xs text-muted-foreground @max-md/panel:hidden">
			{wholeWorkspace ? m.ws_analytics_pods_hint_workspace() : m.ws_analytics_pods_hint()}
		</span>
	{/snippet}
	<!-- Too many columns for a narrow card: the table scrolls sideways inside it. -->
	<Table.Root class={cn('min-w-[54rem] text-[0.8125rem]', NUM)}>
		<Table.Header class="text-xs">
			<Table.Row class="border-border hover:bg-transparent">
				<Table.Head class={cn(th, 'pl-0')}>{m.analytics_pod()}</Table.Head>
				<Table.Head class={th}>{m.analytics_node()}</Table.Head>
				<Table.Head class={th}>{m.status()}</Table.Head>
				<Table.Head class={cn(th, 'text-right')}>{m.analytics_restarts()}</Table.Head>
				<Table.Head class={cn(th, 'text-right')}>{m.ws_analytics_col_cpu()}</Table.Head>
				<Table.Head class={cn(th, 'text-right')}>{m.ws_analytics_col_memory()}</Table.Head>
				<Table.Head class={cn(th, 'pr-0 text-right')}>{m.ws_analytics_col_gpu()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#each sorted as pod (pod.pod)}
				{@const status = podStatus(pod)}
				{@const restarts = Math.round(pod.restarts)}
				<Table.Row class="border-border/60 hover:bg-transparent">
					<Table.Cell class={cn(td, 'pl-0')}>
						<OverviewLink target={detailLink(POD, namespace, pod.pod)} class="block w-fit">
							{@render name(pod.pod, 'max-w-[19rem]', '')}
						</OverviewLink>
					</Table.Cell>
					<Table.Cell class={td}>
						{#if pod.node}
							{@render name(pod.node, 'max-w-[9rem]', 'text-muted-foreground')}
						{:else}
							<span class="text-muted-foreground">{DASH}</span>
						{/if}
					</Table.Cell>
					<Table.Cell class={td}>
						<Status tone={status.tone} variant="dot" class="text-[0.8125rem]">
							{status.text}
						</Status>
					</Table.Cell>
					<Table.Cell class={cn(td, 'text-right', restarts > 0 && 'text-chart-1')}>
						{fmt(restarts)}
					</Table.Cell>
					<Table.Cell class={cn(td, 'text-right')}>
						{pair(fmtCores(pod.cpu.used), fmtCores(pod.cpu.requested))}
					</Table.Cell>
					<Table.Cell class={cn(td, 'text-right')}>
						{pair(fmtGiB(pod.memory.used), fmtGiB(pod.memory.requested), m.analytics_unit_gib())}
					</Table.Cell>
					<Table.Cell class={cn(td, 'pr-0 text-right')}>
						{#if pod.gpu}
							{pair(fmtGiB(pod.gpu.used), fmtGiB(pod.gpu.allocated), m.analytics_unit_gib())}
						{:else}
							<span class="text-muted-foreground">{DASH}</span>
						{/if}
					</Table.Cell>
				</Table.Row>
			{/each}
		</Table.Body>
	</Table.Root>
</Panel>

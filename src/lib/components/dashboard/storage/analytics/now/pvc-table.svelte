<script lang="ts">
	import { NUM, Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Table from '$lib/components/ui/table';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { DASH, fmtBytes } from '../../overview/format';
	import { fmtGrowthAmount } from '../lib/format';
	import type { PvcItem } from '../lib/model';

	// The PVCs whose data lives in the picked pool, largest first.
	let {
		pvcs,
		state,
		workspaceOf,
		class: className
	}: {
		pvcs: PvcItem[];
		state: WidgetState;
		workspaceOf: (namespace: string) => string;
		class?: string;
	} = $props();

	const rows = $derived([...pvcs].sort((a, b) => (b.used ?? -1) - (a.used ?? -1)));

	const HEAD = 'h-8 px-2 text-xs font-[450] whitespace-nowrap text-muted-foreground';
	const NUM_HEAD = cn(HEAD, 'text-right');
	const CELL = 'h-10 px-2 py-0 text-[0.8125rem] whitespace-nowrap';
	const NUM_CELL = cn(CELL, 'text-right', NUM);
</script>

<Panel title={m.storage_an_pvcs_in_pool()} class={cn('min-w-0', className)} bodyClass="pt-2">
	{#snippet actions()}
		<span class="mt-1.5 mr-1.5 text-xs text-muted-foreground">{m.storage_an_largest_first()}</span>
	{/snippet}
	<Table.Root class="min-w-[34rem] table-fixed">
		<Table.Header>
			<Table.Row class="hover:bg-transparent">
				<Table.Head class={cn(HEAD, 'w-[40%] pl-0')}>{m.storage_an_col_pvc()}</Table.Head>
				<Table.Head class={cn(HEAD, 'w-[22%]')}>{m.storage_an_col_workspace()}</Table.Head>
				<Table.Head class={NUM_HEAD}>{m.storage_col_used()}</Table.Head>
				<Table.Head class={NUM_HEAD}>{m.storage_an_col_capacity()}</Table.Head>
				<Table.Head class={cn(NUM_HEAD, 'pr-0')}>{m.storage_an_col_growth_day()}</Table.Head>
			</Table.Row>
		</Table.Header>
		<Table.Body>
			{#if state === 'loading'}
				{#each [0, 1] as index (index)}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell colspan={5} class="h-10 px-0"><Skeleton class="h-3 w-full" /></Table.Cell>
					</Table.Row>
				{/each}
			{:else}
				{#each rows as pvc (pvc.key)}
					<Table.Row class="hover:bg-transparent">
						<Table.Cell class={cn(CELL, 'truncate pl-0 font-mono text-xs')} title={pvc.name}>
							{pvc.name}
						</Table.Cell>
						<Table.Cell
							class={cn(CELL, 'truncate font-mono text-xs text-muted-foreground')}
							title={pvc.namespace}
						>
							{workspaceOf(pvc.namespace)}
						</Table.Cell>
						<Table.Cell class={NUM_CELL}>{fmtBytes(pvc.used)}</Table.Cell>
						<Table.Cell class={cn(NUM_CELL, 'text-muted-foreground')}>
							{fmtBytes(pvc.capacity)}
						</Table.Cell>
						<Table.Cell class={cn(NUM_CELL, 'pr-0')}>
							{pvc.growth && pvc.growth.kind !== 'flat'
								? fmtGrowthAmount(pvc.growth)
								: pvc.growth
									? m.storage_growth_flat()
									: DASH}
						</Table.Cell>
					</Table.Row>
				{/each}
			{/if}
		</Table.Body>
	</Table.Root>
</Panel>

<script lang="ts">
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import InfoIcon from '@lucide/svelte/icons/info';
	import type { PrometheusDriver } from 'prometheus-query';
	import { SvelteSet } from 'svelte/reactivity';

	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { Meter, NUM } from '$lib/components/dashboard/kit';
	import * as Card from '$lib/components/ui/card';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import * as Table from '$lib/components/ui/table';
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import {
		fastestGrowing,
		type Filesystem,
		FULL_IN_CAP_DAYS,
		FULL_IN_WARN_DAYS,
		parseRedundancy,
		type Pool,
		type PoolRow,
		poolRows,
		pvcsPerPool,
		rawLevel,
		serviceOf,
		sharedFullInDays,
		splitPoolName
	} from './ceph';
	import {
		DASH,
		fmtBytes,
		fmtDaysAhead,
		fmtFullIn,
		fmtPct,
		LEVEL_TEXT,
		serviceLabel
	} from './format';
	import { LAYOUT } from './layout';
	import { InstantPoll } from './poll.svelte';
	import { POOL_QUERIES } from './queries';
	import { byLabel, first, labelsOf } from './vectors';

	// Every pool, the one that fills first on top. Growth is each pool's 7-day average; the line
	// in the header is about the free space the pools share, which runs out before any one pool's
	// own estimate. The Object service's small pools fold into one row.
	let { client, isReloading = $bindable() }: { client: PrometheusDriver; isReloading: boolean } =
		$props();

	const poll = new InstantPoll(() => client, POOL_QUERIES);
	$effect(() => poll.run(isReloading));

	const pools = $derived.by((): Pool[] => {
		const data = poll.data;
		const stored = byLabel(data, 'stored', 'pool_id');
		const maxAvail = byLabel(data, 'maxAvail', 'pool_id');
		const used = byLabel(data, 'percentUsed', 'pool_id');
		const perDay = byLabel(data, 'perDay', 'pool_id');
		const filesystems: Filesystem[] = labelsOf(data, 'filesystems').map((l) => ({
			id: l.fs_id,
			name: l.name,
			dataPools: (l.data_pools ?? '').split(',').filter(Boolean),
			metadataPool: l.metadata_pool
		}));
		const pvcs = pvcsPerPool(
			labelsOf(data, 'volumes').map((l) => ({ driver: l.csi_driver, handle: l.csi_volume_handle })),
			filesystems
		);
		return labelsOf(data, 'meta').map((l) => {
			const redundancy = parseRedundancy(l.description);
			return {
				id: l.pool_id,
				name: l.name,
				service: serviceOf(
					{ id: l.pool_id, name: l.name, application: l.application },
					filesystems
				),
				copies: redundancy?.copies,
				copiesLabel: redundancy?.label,
				stored: stored.get(l.pool_id) ?? 0,
				maxAvail: maxAvail.get(l.pool_id) ?? 0,
				usedPct: used.get(l.pool_id) ?? 0,
				perDay: perDay.get(l.pool_id),
				pvcs: pvcs.get(l.pool_id) ?? 0
			};
		});
	});
	const rows = $derived(poolRows(pools));
	const cardState = $derived(poll.state(() => pools.length > 0));

	const summary = $derived.by(() => {
		const fastest = fastestGrowing(pools);
		const rawTotal = first(poll.data, 'rawTotal');
		const rawUsed = first(poll.data, 'rawUsed');
		const fullRatio = first(poll.data, 'fullRatio');
		if (!fastest) return m.storage_pools_header_flat();
		const shared =
			rawTotal === undefined || rawUsed === undefined || fullRatio === undefined
				? undefined
				: sharedFullInDays(rawTotal, rawUsed, fullRatio, pools);
		if (shared === undefined || shared > FULL_IN_CAP_DAYS) {
			return m.storage_pools_header_over({ pool: fastest.name });
		}
		return m.storage_pools_header_growing({ duration: fmtDaysAhead(shared), pool: fastest.name });
	});

	// Folded rows start closed; the set holds the ones opened.
	const open = new SvelteSet<string>();
	function toggle(id: string) {
		if (open.has(id)) open.delete(id);
		else open.add(id);
	}

	function growthText(row: PoolRow): string {
		if (!row.growth) return DASH;
		if (row.growth.kind === 'flat') return m.storage_growth_flat();
		const sign = row.growth.kind === 'growing' ? '+' : '';
		return m.storage_per_day({ value: `${sign}${fmtBytes(row.growth.perDay)}` });
	}

	// A pool's name opens it in Analytics.
	function analyticsHref(name: string): string {
		const path = resolve('/(auth)/[cluster]/[workspace]/dashboard/storage', {
			cluster: page.params.cluster ?? '',
			workspace: page.params.workspace ?? ''
		});
		return `${path}?${new URLSearchParams({ tab: 'analytics', by: 'pool', sel: name })}`;
	}

	const HEAD = 'h-8 px-2.5 text-xs font-[450] whitespace-nowrap text-muted-foreground';
	const NUM_HEAD = cn(HEAD, 'text-right');
	const CELL = 'px-2.5 py-0 whitespace-nowrap';
	const NUM_CELL = cn(CELL, 'text-right', NUM);
	const COLUMNS = 9;
</script>

<div class={LAYOUT.full}>
	<Card.Root
		class="@container/panel h-full min-h-[20.875rem] gap-0 rounded-2xl p-4 shadow-(--card-frame) ring-0 @md:min-h-[21.125rem] @md:px-5 @md:py-[1.125rem] @[58.5rem]:min-h-[18.375rem]"
	>
		<!-- Narrow, the sentence takes a row of its own, two lines tall whether it is loading or not. -->
		<div
			class="flex flex-col gap-1 @4xl/panel:flex-row @4xl/panel:items-start @4xl/panel:justify-between @4xl/panel:gap-6"
		>
			<div class="flex items-center gap-1">
				<Card.Title class="text-sm leading-5 font-[550]">{m.storage_pools()}</Card.Title>
				<Tooltip.Root>
					<Tooltip.Trigger
						class="rounded-sm p-1 text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
						aria-label={m.storage_pools()}
					>
						<InfoIcon class="size-3.5" />
					</Tooltip.Trigger>
					<Tooltip.Content class="max-w-xs"><p>{m.storage_pools_tooltip()}</p></Tooltip.Content>
				</Tooltip.Root>
			</div>
			<div class="min-h-10 text-xs leading-5 text-muted-foreground @4xl/panel:min-h-5">
				{#if cardState === 'ready'}
					{summary}
				{:else if cardState === 'loading'}
					<div class="flex w-full max-w-72 flex-col gap-2 pt-1">
						<Skeleton class="h-3 w-full" />
						<Skeleton class="h-3 w-2/3 @4xl/panel:hidden" />
					</div>
				{/if}
			</div>
		</div>
		<div class="pt-3">
			{#if cardState === 'empty' || cardState === 'error'}
				<p class="text-muted-foreground">
					<span class="block text-[1.75rem] leading-8" aria-hidden="true">—</span>
					<span class="text-xs leading-4">
						{cardState === 'error' ? m.dashboard_couldnt_load() : m.no_data_display()}
					</span>
				</p>
			{:else}
				<!-- Scrolls sideways inside the card when the card is narrower than the columns. -->
				<Table.Root class="min-w-[56rem]">
					<Table.Header>
						<Table.Row class="hover:bg-transparent">
							<Table.Head class={cn(HEAD, 'pl-0')}>{m.storage_col_pool()}</Table.Head>
							<Table.Head class={HEAD}>{m.storage_col_service()}</Table.Head>
							<Table.Head class={NUM_HEAD}>{m.storage_col_copies()}</Table.Head>
							<Table.Head class={NUM_HEAD}>{m.storage_col_stored()}</Table.Head>
							<Table.Head class={NUM_HEAD}>{m.storage_col_max_avail()}</Table.Head>
							<Table.Head class={cn(HEAD, 'w-48')}>{m.storage_col_used()}</Table.Head>
							<Table.Head class={NUM_HEAD}>{m.storage_col_growth()}</Table.Head>
							<Table.Head class={NUM_HEAD}>{m.storage_col_full_in()}</Table.Head>
							<Table.Head class={cn(NUM_HEAD, 'pr-0')}>{m.storage_col_pvcs()}</Table.Head>
						</Table.Row>
					</Table.Header>
					<Table.Body>
						{#if cardState === 'loading'}
							{#each [0, 1, 2, 3] as index (index)}
								<Table.Row class="h-12 hover:bg-transparent">
									<Table.Cell colspan={COLUMNS} class="px-0">
										<Skeleton class="h-4 w-full" />
									</Table.Cell>
								</Table.Row>
							{/each}
						{:else}
							{#each rows as row (row.id)}
								{@const expanded = open.has(row.id)}
								{@render poolRow(row, row.members ? expanded : undefined)}
								{#if row.members && expanded}
									{#each row.members as member (member.id)}
										{@render poolRow(member, undefined, true)}
									{/each}
								{/if}
							{/each}
						{/if}
					</Table.Body>
				</Table.Root>
			{/if}
		</div>
	</Card.Root>
</div>

{#snippet poolRow(row: PoolRow, expanded: boolean | undefined, nested = false)}
	{@const warn = row.fullIn !== undefined && row.fullIn < FULL_IN_WARN_DAYS}
	<Table.Row class={cn('h-12', nested && 'bg-muted/40 hover:bg-muted/60')}>
		<Table.Cell class={cn(CELL, 'pl-0', nested && 'pl-6')}>
			{#if row.members}
				<button
					type="button"
					class="-ml-1 flex items-center gap-1 rounded-sm px-1 text-[0.8125rem] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring"
					aria-expanded={expanded}
					onclick={() => toggle(row.id)}
				>
					<ChevronRightIcon
						class={cn(
							'size-4 shrink-0 text-muted-foreground transition-transform',
							expanded && 'rotate-90'
						)}
						aria-hidden="true"
					/>
					{m.storage_object_pools({ count: String(row.members.length) })}
				</button>
			{:else}
				<!-- Links to the pool in Analytics. A long name keeps its end and shows in full on
				     hover. -->
				{@const [head, tail] = splitPoolName(row.name)}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<!-- The path comes from resolve(); only the query is added. -->
							<!-- eslint-disable svelte/no-navigation-without-resolve -->
							<a
								{...props}
								href={analyticsHref(row.name)}
								class={cn(
									'flex min-w-0 rounded-sm font-mono text-[0.8125rem] leading-5 underline decoration-border underline-offset-[3px] outline-none hover:decoration-foreground focus-visible:ring-2 focus-visible:ring-ring',
									nested ? 'max-w-[14.5rem]' : 'max-w-[16rem]'
								)}
								aria-label={row.name}
							>
								<span class="truncate">{head}</span><span class="shrink-0">{tail}</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content side="top" align="start" class="max-w-none">
						<p class="font-mono text-xs whitespace-nowrap">{row.name}</p>
					</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</Table.Cell>
		<Table.Cell class={CELL}>
			{#if !nested}
				<span
					class="inline-flex h-5 items-center rounded-full bg-muted px-2 text-[11px] leading-4 text-muted-foreground"
				>
					{serviceLabel(row.service)}
				</span>
			{/if}
		</Table.Cell>
		<Table.Cell class={NUM_CELL}>{row.copiesLabel ?? DASH}</Table.Cell>
		<Table.Cell class={NUM_CELL}>{fmtBytes(row.stored)}</Table.Cell>
		<Table.Cell class={NUM_CELL}>{fmtBytes(row.maxAvail)}</Table.Cell>
		<Table.Cell class={CELL}>
			<span class="flex items-center gap-3">
				<Meter size="sm" value={row.usedPct} />
				<span class={cn('w-12 text-right', NUM, LEVEL_TEXT[rawLevel(row.usedPct)])}>
					{fmtPct(row.usedPct)}
				</span>
			</span>
		</Table.Cell>
		<Table.Cell class={NUM_CELL}>{growthText(row)}</Table.Cell>
		<Table.Cell class={cn(NUM_CELL, warn && 'text-chart-1')}>{fmtFullIn(row.fullIn)}</Table.Cell>
		<Table.Cell class={cn(NUM_CELL, 'pr-0')}>{row.pvcs > 0 ? row.pvcs : DASH}</Table.Cell>
	</Table.Row>
{/snippet}

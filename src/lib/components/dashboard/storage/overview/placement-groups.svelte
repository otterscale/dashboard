<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { NUM, Panel } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { groupPgs, parseRedundancy } from './ceph';
	import { fmtCount, fmtLeft, fmtRate, LEVEL_BG, LEVEL_TEXT } from './format';
	import { LAYOUT } from './layout';
	import { InstantPoll } from './poll.svelte';
	import { PG_QUERIES } from './queries';
	import { byLabel, first, labelsOf } from './vectors';

	// Every placement group in one bar, by whether it is clean, being repaired, or in trouble,
	// then the three numbers that say how bad trouble is: recovery speed, degraded objects, and
	// slow operations. All clean reads as zeros in the healthy colour.
	let { client, isReloading = $bindable() }: { client: PrometheusDriver; isReloading: boolean } =
		$props();

	const poll = new InstantPoll(() => client, PG_QUERIES);
	$effect(() => poll.run(isReloading));

	const groups = $derived.by(() => {
		const data = poll.data;
		const total = first(data, 'total');
		if (total === undefined) return undefined;
		const n = (key: string) => first(data, key) ?? 0;
		return groupPgs({
			total,
			active: n('active'),
			clean: n('clean'),
			degraded: n('degraded'),
			undersized: n('undersized'),
			recovering: n('recovering'),
			backfilling: n('backfilling'),
			waiting: n('waiting')
		});
	});
	const cardState = $derived(poll.state(() => groups !== undefined));

	const recovery = $derived.by(() => {
		const data = poll.data;
		const bytes = first(data, 'recoveryBytes') ?? 0;
		const objectsPerSecond = first(data, 'recoveryObjects') ?? 0;
		const left = (first(data, 'degradedObjects') ?? 0) + (first(data, 'misplacedObjects') ?? 0);
		return {
			bytes,
			seconds: objectsPerSecond > 0 && left > 0 ? left / objectsPerSecond : undefined
		};
	});
	const degraded = $derived(first(poll.data, 'degradedObjects') ?? 0);
	// Ceph counts degraded object copies, so the whole is every object times its pool's copies.
	const copiesTotal = $derived.by(() => {
		const copies = new Map(
			labelsOf(poll.data, 'meta').map((l) => [l.pool_id, parseRedundancy(l.description)?.copies])
		);
		let total = 0;
		for (const [id, objects] of byLabel(poll.data, 'objects', 'pool_id')) {
			total += objects * (copies.get(id) ?? 1);
		}
		return total;
	});
	const slowOps = $derived(first(poll.data, 'slowOps') ?? 0);

	const segments = $derived(
		groups
			? [
					{
						key: 'clean',
						count: groups.clean,
						level: 'green' as const,
						label: m.storage_pg_clean()
					},
					{
						key: 'moving',
						count: groups.moving,
						level: 'orange' as const,
						label: m.storage_pg_moving()
					},
					{
						key: 'bad',
						count: groups.bad,
						level: 'red' as const,
						label: groups.inactive > 0 ? m.storage_pg_bad_inactive() : m.storage_pg_bad()
					}
				]
			: []
	);

	const CELL = 'min-w-0 px-3 py-1 first:pl-0 @lg/panel:px-4';
	const LABEL = 'text-xs leading-4 text-muted-foreground';
	const VALUE = cn('mt-1 text-xl leading-7 tracking-tight', NUM);
	const SUB = 'text-xs leading-4 text-muted-foreground';
</script>

<div class={LAYOUT.pgs}>
	<Panel
		title={m.storage_pgs()}
		state={cardState === 'loading' ? 'ready' : cardState}
		class="min-h-[17rem]"
	>
		{#snippet actions()}
			{#if groups}
				<span class={cn('mt-1.5 mr-1 text-xs whitespace-nowrap text-muted-foreground', NUM)}
					>{m.storage_pgs_total({ count: fmtCount(groups.total) })}</span
				>
			{/if}
		{/snippet}
		{#if cardState === 'loading' || !groups}
			<Skeleton class="h-2.5 w-full rounded-full" />
			<Skeleton class="mt-3 h-3.5 w-48" />
			<div class="mt-auto grid grid-cols-3 gap-4 pt-6">
				{#each [0, 1, 2] as index (index)}
					<div class="flex flex-col gap-2">
						<Skeleton class="h-3 w-20" />
						<Skeleton class="h-6 w-14" />
						<Skeleton class="h-3 w-24" />
					</div>
				{/each}
			</div>
		{:else}
			<!-- Segments in proportion, 2px apart; an empty group draws nothing. -->
			<div
				class="flex h-2.5 w-full gap-0.5"
				role="img"
				aria-label={segments.map((s) => `${s.count} ${s.label}`).join(', ')}
			>
				{#each segments.filter((s) => s.count > 0) as segment (segment.key)}
					<span
						class={cn(
							'h-full min-w-1 rounded-[3px] first:rounded-l-full last:rounded-r-full',
							LEVEL_BG[segment.level]
						)}
						style:flex-grow={segment.count}
					></span>
				{/each}
			</div>
			<ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
				{#each segments.filter((s) => s.count > 0 || s.key === 'clean') as segment (segment.key)}
					<li class="flex items-center gap-1.5">
						<span class={cn('size-2 rounded-[2px]', LEVEL_BG[segment.level])} aria-hidden="true"
						></span>
						<span class={NUM}>{fmtCount(segment.count)}</span>
						{segment.label}
					</li>
				{/each}
			</ul>
			<div class="mt-auto grid grid-cols-3 divide-x pt-5">
				<div class={CELL}>
					<p class={LABEL}>{m.storage_recovery()}</p>
					<p class={cn(VALUE, recovery.bytes > 0 ? LEVEL_TEXT.orange : LEVEL_TEXT.green)}>
						{fmtRate(recovery.bytes)}
					</p>
					<p class={SUB}>
						{recovery.seconds === undefined
							? m.storage_recovery_idle()
							: m.storage_recovery_left({ duration: fmtLeft(recovery.seconds) })}
					</p>
				</div>
				<div class={CELL}>
					<p class={LABEL}>{m.storage_degraded_objects()}</p>
					<p class={cn(VALUE, degraded > 0 ? LEVEL_TEXT.orange : LEVEL_TEXT.green)}>
						{fmtCount(degraded)}
					</p>
					<p class={SUB}>{m.storage_of_objects({ total: fmtCount(copiesTotal) })}</p>
				</div>
				<div class={CELL}>
					<p class={LABEL}>{m.storage_slow_ops()}</p>
					<p class={cn(VALUE, slowOps > 0 ? LEVEL_TEXT.orange : LEVEL_TEXT.green)}>
						{fmtCount(slowOps)}
					</p>
					<p class={SUB}>{m.storage_right_now()}</p>
				</div>
			</div>
		{/if}
	</Panel>
</div>

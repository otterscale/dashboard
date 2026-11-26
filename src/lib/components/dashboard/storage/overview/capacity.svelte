<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { Meter, Tile } from '$lib/components/dashboard/kit';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { capacity, osdLevel, parseRedundancy, promisedLevel, rawLevel } from './ceph';
	import { fmtBytes, fmtCopies, fmtPct, LEVEL_TEXT, osdsLabel } from './format';
	import { LAYOUT } from './layout';
	import { InstantPoll } from './poll.svelte';
	import { CAPACITY_QUERIES } from './queries';
	import { byLabel, first, labelsOf } from './vectors';

	// Four numbers, each a share with a bar and one line of context: raw OSD space, data in the
	// pools, what PVCs were promised out of usable space, and the OSD that will fill first.
	let { client, isReloading = $bindable() }: { client: PrometheusDriver; isReloading: boolean } =
		$props();

	const poll = new InstantPoll(() => client, CAPACITY_QUERIES);
	$effect(() => poll.run(isReloading));

	const result = $derived.by(() => {
		const data = poll.data;
		const rawTotal = first(data, 'rawTotal');
		const rawUsed = first(data, 'rawUsed');
		if (rawTotal === undefined || rawUsed === undefined) return undefined;
		const stored = byLabel(data, 'stored', 'pool_id');
		const maxAvail = byLabel(data, 'maxAvail', 'pool_id');
		const copies = new Map(
			labelsOf(data, 'meta').map((l) => [l.pool_id, parseRedundancy(l.description)])
		);
		const used = byLabel(data, 'osdUsed', 'ceph_daemon');
		const hosts = new Map(labelsOf(data, 'osdHost').map((l) => [l.ceph_daemon, l.hostname]));
		const c = capacity({
			rawTotal,
			rawUsed,
			pools: [...stored].map(([id, bytes]) => ({
				stored: bytes,
				maxAvail: maxAvail.get(id) ?? 0,
				copies: copies.get(id)?.copies
			})),
			requested: first(data, 'requested'),
			osds: [...byLabel(data, 'osdTotal', 'ceph_daemon')].map(([id, total]) => ({
				id,
				host: hosts.get(id),
				used: used.get(id) ?? 0,
				total
			}))
		});
		const copiesLabel = [...copies.values()].find((r) => r?.copies === c.writableCopies)?.label;
		return { ...c, copiesLabel };
	});
	const nearfull = $derived(first(poll.data, 'nearfull'));
	const full = $derived(first(poll.data, 'full'));

	const cardState = $derived(poll.state(() => result !== undefined));
	// A card whose own number is missing (no pools, no PVC metrics) says so on its own.
	const storedState = $derived(cardState === 'ready' && !result?.usable ? 'empty' : cardState);
	const promisedState = $derived(cardState === 'ready' && !result?.promised ? 'empty' : cardState);
	const fullestState = $derived(cardState === 'ready' && !result?.fullest ? 'empty' : cardState);

	// The loaded height, held while loading or empty so the row never moves.
	const TILE = 'min-h-[9.125rem]';
	const BIG = 'text-[1.75rem] leading-8 tracking-tight slashed-zero tabular-nums';
	const NOTE = 'mt-2 min-h-8 text-xs leading-4 text-muted-foreground';
</script>

<div class={LAYOUT.capacity}>
	<Tile
		label={m.storage_raw_capacity()}
		tooltip={m.storage_raw_tooltip()}
		state={cardState}
		class={TILE}
	>
		{#snippet body()}
			{#if result}
				<p class={cn(BIG, LEVEL_TEXT[rawLevel(result.raw.pct)])}>{fmtPct(result.raw.pct)}</p>
				<Meter class="mt-3 flex" value={result.raw.pct} />
				<p class={NOTE}>
					{m.storage_raw_note({
						used: fmtBytes(result.raw.used),
						total: fmtBytes(result.raw.total),
						osds: osdsLabel(result.raw.osds)
					})}
				</p>
			{/if}
		{/snippet}
	</Tile>
</div>

<div class={LAYOUT.capacity}>
	<Tile
		label={m.storage_data_stored()}
		tooltip={m.storage_data_stored_tooltip()}
		state={storedState}
		class={TILE}
	>
		{#snippet body()}
			{#if result}
				<p class={BIG}>{fmtBytes(result.stored)}</p>
				<Meter class="mt-3 flex" value={result.storedPct} />
				<p class={NOTE}>
					{m.storage_writable_note({
						free: fmtBytes(result.writable),
						copies: fmtCopies(result.writableCopies, result.copiesLabel)
					})}
				</p>
			{/if}
		{/snippet}
	</Tile>
</div>

<div class={LAYOUT.capacity}>
	<Tile
		label={m.storage_promised()}
		tooltip={m.storage_promised_tooltip()}
		state={promisedState}
		class={TILE}
	>
		{#snippet body()}
			{#if result?.promised}
				<p class={cn(BIG, LEVEL_TEXT[promisedLevel(result.promised.pct)])}>
					{fmtPct(result.promised.pct)}
				</p>
				<Meter class="mt-3 flex" value={result.promised.pct} />
				<p class={NOTE}>
					{m.storage_promised_note({
						requested: fmtBytes(result.promised.requested),
						usable: fmtBytes(result.usable)
					})}
				</p>
			{/if}
		{/snippet}
	</Tile>
</div>

<div class={LAYOUT.capacity}>
	<Tile
		label={m.storage_fullest_osd()}
		tooltip={m.storage_fullest_tooltip()}
		state={fullestState}
		class={TILE}
	>
		{#snippet body()}
			{#if result?.fullest}
				{@const fullest = result.fullest}
				<p
					class={cn(
						BIG,
						nearfull !== undefined &&
							full !== undefined &&
							LEVEL_TEXT[osdLevel(fullest.pct, nearfull, full)]
					)}
				>
					{fmtPct(fullest.pct)}
				</p>
				<div class="relative mt-3 flex">
					<Meter class="flex" value={fullest.pct} />
					{#if nearfull !== undefined}
						<!-- The nearfull ratio, where Ceph starts to warn. -->
						<span
							class="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 rounded-full bg-foreground"
							style:left="{nearfull * 100}%"
							aria-hidden="true"
						></span>
					{/if}
				</div>
				<p class={cn(NOTE, 'break-words')}>
					{m.storage_fullest_note({
						osd: fullest.id,
						host: fullest.host ?? '—',
						pct: nearfull === undefined ? '—' : fmtPct(nearfull * 100)
					})}
				</p>
			{/if}
		{/snippet}
	</Tile>
</div>

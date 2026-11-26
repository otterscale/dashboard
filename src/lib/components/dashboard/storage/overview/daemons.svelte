<script lang="ts">
	import type { PrometheusDriver } from 'prometheus-query';

	import { NUM, Panel, type Tone, TONE_TEXT } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { LAYOUT } from './layout';
	import { InstantPoll } from './poll.svelte';
	import { DAEMON_QUERIES } from './queries';
	import { first } from './vectors';

	// One row per kind of daemon, with how many are doing their job. Short of all of them is a
	// warning; none at all, or monitors below a majority, is critical.
	let { client, isReloading = $bindable() }: { client: PrometheusDriver; isReloading: boolean } =
		$props();

	const poll = new InstantPoll(() => client, DAEMON_QUERIES);
	$effect(() => poll.run(isReloading));

	type Row = { label: string; value: string; tone: Tone };

	function share(part: number | undefined, total: number | undefined, majority = false) {
		const p = part ?? 0;
		const t = total ?? 0;
		const tone: Row['tone'] =
			t === 0 || p === 0 || (majority && p <= t / 2) ? 'bad' : p < t ? 'warn' : 'ok';
		return { value: `${p} / ${t}`, tone };
	}

	const rows = $derived.by((): Row[] => {
		const data = poll.data;
		const monTotal = first(data, 'monTotal');
		const osdTotal = first(data, 'osdTotal');
		if (monTotal === undefined && osdTotal === undefined) return [];
		const mgrTotal = first(data, 'mgrTotal') ?? 0;
		// `count(… == 1)` answers nothing, not 0, when no manager is active.
		const mgrActive = first(data, 'mgrActive') ?? 0;
		const standby = Math.max(0, mgrTotal - mgrActive);
		const mds = first(data, 'mds');
		return [
			{
				label: m.storage_mons_in_quorum(),
				...share(first(data, 'monIn'), monTotal, true)
			},
			{
				label: m.storage_managers(),
				value:
					standby > 0
						? m.storage_mgr_active_standby({ active: String(mgrActive), standby: String(standby) })
						: m.storage_mgr_active({ active: String(mgrActive) }),
				tone: mgrActive === 0 ? 'bad' : 'ok'
			},
			{ label: m.storage_osds_up(), ...share(first(data, 'osdUp'), osdTotal) },
			{ label: m.storage_osds_in(), ...share(first(data, 'osdIn'), osdTotal) },
			// Only where there is a CephFS. Ceph's metrics do not say which one is active.
			...(mds
				? [
						{
							label: m.storage_metadata_servers(),
							value: m.storage_mds_running({ count: String(mds) }),
							tone: 'ok' as const
						}
					]
				: [])
		];
	});

	const cardState = $derived(poll.state(() => rows.length > 0));
</script>

<div class={LAYOUT.daemons}>
	<Panel
		title={m.storage_daemons()}
		state={cardState === 'loading' ? 'ready' : cardState}
		class="min-h-[17rem]"
	>
		<ul class="border-t">
			{#if cardState === 'loading'}
				{#each [0, 1, 2, 3, 4] as index (index)}
					<li class="flex h-10 items-center justify-between gap-3 border-b last:border-b-0">
						<Skeleton class="h-3.5 w-32" />
						<Skeleton class="h-3.5 w-16" />
					</li>
				{/each}
			{:else}
				{#each rows as row (row.label)}
					<li class="flex h-10 items-center justify-between gap-3 border-b text-sm last:border-b-0">
						<span class="truncate">{row.label}</span>
						<!-- The number alone carries the state, in the healthy, warning or critical colour. -->
						<span class={cn('whitespace-nowrap', NUM, TONE_TEXT[row.tone])}>{row.value}</span>
					</li>
				{/each}
			{/if}
		</ul>
	</Panel>
</div>

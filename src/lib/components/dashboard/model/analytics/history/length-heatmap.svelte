<script lang="ts">
	import { NUM, Panel, type WidgetState } from '$lib/components/dashboard/kit';
	import { Skeleton } from '$lib/components/ui/skeleton';
	import { m } from '$lib/messages';

	// Requests by token length over time: one row per length bin (longest at the top), one column
	// per time bucket, one colour whose depth is the count.
	let {
		title,
		grid,
		state: status,
		height = 180
	}: {
		title: string;
		grid: { bins: string[]; times: number[]; counts: number[][] };
		state: WidgetState;
		height?: number;
	} = $props();

	const max = $derived(Math.max(0, ...grid.counts.flat()));
	const rows = $derived(grid.bins.map((label, i) => ({ label, counts: grid.counts[i] })).reverse());
	const long = $derived(
		grid.times.length > 1 && grid.times[grid.times.length - 1] - grid.times[0] > 36 * 3600_000
	);
	const time = (t: number) =>
		long
			? new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' })
			: new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
	const ticks = $derived.by(() => {
		const n = grid.times.length;
		if (n === 0) return [];
		const k = Math.min(4, n);
		return Array.from({ length: k }, (_, i) => Math.round((i * (n - 1)) / Math.max(1, k - 1)));
	});
	/** 0 is an empty cell; otherwise 14 %–100 % of the ink colour. */
	function fill(count: number): string {
		if (!(count > 0) || max <= 0) return 'var(--muted)';
		const pct = Math.round(14 + (count / max) * 86);
		return `color-mix(in oklab, var(--chart-3) ${pct}%, var(--card))`;
	}
	let hover = $state<{ label: string; j: number; count: number } | undefined>(undefined);
	const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
</script>

<Panel {title} state={status} class="min-h-[18rem]" bodyClass="pt-2">
	{#snippet actions()}
		{#if status === 'ready'}
			<span class="mt-1.5 mr-1 text-xs whitespace-nowrap text-muted-foreground">
				{m.model_analytics_darker_more()}
			</span>
		{/if}
	{/snippet}
	<div style:height="{height}px" class="flex flex-col">
		{#if grid.times.length === 0}
			<Skeleton class="h-full w-full rounded-lg" />
		{:else}
			<div
				class="grid min-h-0 flex-1 gap-x-2"
				style:grid-template-columns="3rem 1fr"
				onpointerleave={() => (hover = undefined)}
				role="img"
				aria-label={title}
				style:grid-template-rows="repeat({rows.length}, minmax(0, 1fr))"
			>
				{#each rows as row (row.label)}
					<span class="self-center text-right text-[10px] leading-none text-muted-foreground {NUM}">
						{row.label}
					</span>
					<div
						class="grid gap-px py-px"
						style:grid-template-columns="repeat({grid.times.length}, minmax(0, 1fr))"
					>
						{#each row.counts as count, j (j)}
							<span
								class="block h-full rounded-[1px]"
								style:background={fill(count)}
								onpointerenter={() => (hover = { label: row.label, j, count })}
								aria-hidden="true"
							></span>
						{/each}
					</div>
				{/each}
			</div>
			<div class="relative mt-1.5 ml-[3.5rem] h-4 text-[11px] text-muted-foreground {NUM}">
				{#each ticks as i (i)}
					<span
						class="absolute -translate-x-1/2 first:translate-x-0 last:-translate-x-full"
						style:left="{grid.times.length > 1 ? (i / (grid.times.length - 1)) * 100 : 0}%"
					>
						{time(grid.times[i])}
					</span>
				{/each}
			</div>
		{/if}
	</div>
	<p class="mt-3 min-h-5 text-xs text-muted-foreground {NUM}">
		{#if hover}
			{time(grid.times[hover.j])} · {hover.label} · {m.model_analytics_requests_count({
				count: fmt(hover.count)
			})}
		{/if}
	</p>
</Panel>

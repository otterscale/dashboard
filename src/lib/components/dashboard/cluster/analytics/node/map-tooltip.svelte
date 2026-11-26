<script lang="ts">
	import { NUM } from '$lib/components/dashboard/kit';

	// The dark hover card over a map tile. It trails the pointer (`x`/`y` are viewport
	// coordinates) and flips to the pointer's other side near a window edge; `fixed`, so no
	// map or panel clips it. Pointer-transparent, so it never steals the hover.
	let {
		title,
		subtitle,
		lines,
		x,
		y
	}: {
		title: string;
		subtitle?: string;
		lines: { k: string; v: string }[];
		x: number;
		y: number;
	} = $props();

	const GAP = 14;
	const EDGE = 8;
	let cardWidth = $state(0);
	let cardHeight = $state(0);
	let innerWidth = $state(0);
	let innerHeight = $state(0);

	const left = $derived(
		Math.max(EDGE, x + GAP + cardWidth > innerWidth - EDGE ? x - GAP - cardWidth : x + GAP)
	);
	const top = $derived(
		Math.max(EDGE, y + GAP + cardHeight > innerHeight - EDGE ? y - GAP - cardHeight : y + GAP)
	);
</script>

<svelte:window bind:innerWidth bind:innerHeight />

<div
	class="pointer-events-none fixed z-50 w-max max-w-75 rounded-[0.625rem] bg-ink px-3 py-2.5 text-xs leading-4 text-ink-foreground shadow-lg ring-1 ring-ink-foreground/10"
	style:left="{left}px"
	style:top="{top}px"
	bind:offsetWidth={cardWidth}
	bind:offsetHeight={cardHeight}
	role="tooltip"
>
	<p class="truncate font-mono text-[0.8125rem]">{title}</p>
	{#if subtitle}<p class="truncate text-ink-muted">{subtitle}</p>{/if}
	{#if lines.length > 0}
		<dl class="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
			{#each lines as line (line.k)}
				<dt class="text-ink-muted">{line.k}</dt>
				<dd class="font-mono {NUM}">{line.v}</dd>
			{/each}
		</dl>
	{/if}
</div>

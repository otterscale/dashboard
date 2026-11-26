<script lang="ts">
	import { m } from '$lib/messages';

	import { fmtCores, fmtGiB } from '../lib/format';
	import { squarify } from '../lib/treemap';
	import MapTooltip from './map-tooltip.svelte';
	import { type Measure, type OccupancyPod, podValue } from './occupancy-types';

	// CPU or memory: workspaces first, then their pods inside, sized by the chosen measure. What
	// the node has left is one hatched block, unless the measure is a limit that overshoots.
	let {
		pods,
		resource,
		measure,
		capacity,
		groupName
	}: {
		pods: OccupancyPod[];
		resource: 'cpu' | 'memory';
		measure: Measure;
		capacity: number;
		groupName: (id: string) => string;
	} = $props();

	const HEIGHT = 360;
	const HEAD = 24;
	const PAD = 2;
	let width = $state(0);

	const unit = $derived(resource === 'cpu' ? m.analytics_unit_cores() : m.analytics_unit_gib());
	const show = (v: number) => (resource === 'cpu' ? fmtCores(v) : fmtGiB(v));

	type Tile = { pod: OccupancyPod; x: number; y: number; w: number; h: number };
	type Block = {
		id: string;
		color: string;
		total: number;
		x: number;
		y: number;
		w: number;
		h: number;
		head: boolean;
		tiles: Tile[];
	};

	const layout = $derived.by(() => {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- built and read in one pass, never reactive
		const groups = new Map<string, { color: string; pods: OccupancyPod[]; total: number }>();
		for (const p of pods) {
			const v = podValue(p, resource, measure);
			if (!(v > 0)) continue;
			const g = groups.get(p.group.id) ?? { color: p.group.color, pods: [], total: 0 };
			g.pods.push(p);
			g.total += v;
			groups.set(p.group.id, g);
		}
		const used = [...groups.values()].reduce((s, g) => s + g.total, 0);
		const free = measure === 'limit' && used > capacity ? 0 : Math.max(0, capacity - used);
		const top: ({ kind: 'group'; id: string; v: number } | { kind: 'free'; v: number })[] = [
			...[...groups].map(([id, g]) => ({ kind: 'group' as const, id, v: g.total })),
			...(free > 0 ? [{ kind: 'free' as const, v: free }] : [])
		].sort((a, b) => b.v - a.v);
		const rects = squarify(
			top.map((t) => t.v),
			{ x: 0, y: 0, w: width, h: HEIGHT }
		);
		const blocks: Block[] = [];
		let freeRect: { x: number; y: number; w: number; h: number; v: number } | undefined;
		top.forEach((t, i) => {
			const r = rects[i];
			if (t.kind === 'free') {
				freeRect = { ...r, v: t.v };
				return;
			}
			const g = groups.get(t.id)!;
			const head = r.h > 60 && r.w > 64;
			const inner = {
				x: PAD,
				y: PAD + (head ? HEAD : 0),
				w: Math.max(0, r.w - PAD * 2),
				h: Math.max(0, r.h - PAD * 2 - (head ? HEAD : 0))
			};
			const list = g.pods
				.slice()
				.sort((a, b) => podValue(b, resource, measure) - podValue(a, resource, measure));
			const tiles = squarify(
				list.map((p) => podValue(p, resource, measure)),
				inner
			).map((q, j) => ({ pod: list[j], ...q }));
			blocks.push({ id: t.id, color: g.color, total: g.total, ...r, head, tiles });
		});
		return { blocks, free: freeRect, used };
	});

	// The hovered pod, and the pointer in viewport coordinates for the tooltip to trail.
	let hover = $state<OccupancyPod | undefined>();
	let pointer = $state({ x: 0, y: 0 });

	// Both resources at the map's measure: the other two measures are a switch away.
	function tipLines(p: OccupancyPod) {
		return [
			{
				k: m.analytics_cpu(),
				v: `${fmtCores(podValue(p, 'cpu', measure))} ${m.analytics_unit_cores()}`
			},
			{
				k: m.analytics_memory(),
				v: `${fmtGiB(podValue(p, 'memory', measure))} ${m.analytics_unit_gib()}`
			}
		];
	}
</script>

<div
	class="relative w-full"
	style:height="{HEIGHT}px"
	bind:clientWidth={width}
	role="presentation"
	onpointermove={(e) => (pointer = { x: e.clientX, y: e.clientY })}
	onpointerleave={() => (hover = undefined)}
>
	{#if width > 0}
		{#each layout.blocks as block (block.id)}
			<div
				class="absolute overflow-hidden rounded-[0.625rem] border-2 border-card bg-clip-padding"
				style:left="{block.x}px"
				style:top="{block.y}px"
				style:width="{block.w}px"
				style:height="{block.h}px"
				style:background="color-mix(in srgb, {block.color} 8%, var(--card))"
				style:box-shadow="inset 0 0 0 1px color-mix(in srgb, {block.color} 30%, var(--card))"
			>
				{#if block.head}
					<div
						class="flex h-6 items-center justify-between gap-2 px-2 text-xs leading-4"
						title={groupName(block.id)}
					>
						<span class="flex min-w-0 items-center gap-1.5">
							<span class="size-2 shrink-0 rounded-[2px]" style:background={block.color}></span>
							{#if block.w >= 150}
								<span class="truncate font-[550]">{groupName(block.id)}</span>
							{/if}
						</span>
						<span class="shrink-0 text-muted-foreground tabular-nums">
							{show(block.total)}
							{unit}
						</span>
					</div>
				{/if}
				{#each block.tiles as tile (tile.pod.key)}
					{#if tile.w > 0 && tile.h > 0}
						<div
							class="absolute overflow-hidden rounded-lg border-2 border-transparent bg-clip-padding px-2 py-1.5 font-mono text-[0.6875rem] leading-4"
							style:left="{tile.x}px"
							style:top="{tile.y}px"
							style:width="{tile.w}px"
							style:height="{tile.h}px"
							style:background="color-mix(in srgb, {block.color}
							{hover?.key === tile.pod.key ? 40 : 24}%, var(--card))"
							style:box-shadow="inset 0 0 0 1px color-mix(in srgb, {block.color} 55%, var(--card))"
							role="presentation"
							onpointerenter={(e) => {
								hover = tile.pod;
								pointer = { x: e.clientX, y: e.clientY };
							}}
							onpointerleave={() => (hover = undefined)}
						>
							{#if tile.w > 70 && tile.h > 30}
								<p class="truncate">{tile.pod.pod}</p>
								{#if tile.h > 46}
									<p class="truncate text-muted-foreground">
										{show(podValue(tile.pod, resource, measure))}
										{unit}
									</p>
								{/if}
							{/if}
						</div>
					{/if}
				{/each}
			</div>
		{/each}
		{#if layout.free}
			{@const f = layout.free}
			<div
				class="absolute flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-[0.625rem] border-2 border-card bg-clip-padding text-xs text-muted-foreground ring-1 ring-border ring-inset"
				style:left="{f.x}px"
				style:top="{f.y}px"
				style:width="{f.w}px"
				style:height="{f.h}px"
				style:background="repeating-linear-gradient(135deg, var(--muted) 0 2px, transparent 2px 8px)"
			>
				{#if f.w > 80 && f.h > 44}
					<span>{measure === 'usage' ? m.analytics_free() : m.analytics_unallocated()}</span>
					<span class="font-mono tabular-nums">{show(f.v)} {unit}</span>
				{/if}
			</div>
		{/if}
		{#if hover}
			<MapTooltip
				title={hover.pod}
				subtitle={hover.namespace}
				lines={tipLines(hover)}
				x={pointer.x}
				y={pointer.y}
			/>
		{/if}
	{/if}
</div>

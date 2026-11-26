<script lang="ts">
	import { fmtGpuGiB } from '$lib/components/dashboard/kit/format';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { cardItems, type GpuCard, type GpuMeasure, gpuModelName } from '../lib/gpu-cards';
	import { squarify } from '../lib/treemap';
	import type { Group } from '../lib/workspaces';
	import MapTooltip from './map-tooltip.svelte';

	// One card: its whole area is the card's memory. Pods by HAMi allocation or tracked use,
	// what DCGM sees that HAMi tracked to no pod, and what is left. Data only: no warnings here.
	let {
		card,
		measure,
		height,
		groupOf,
		cardsOf
	}: {
		card: GpuCard;
		measure: GpuMeasure;
		height: number;
		groupOf: (namespace: string) => Group;
		/** Cards a pod holds across the cluster. */
		cardsOf: (key: string) => number;
	} = $props();

	let width = $state(0);
	const items = $derived(cardItems(card, measure));
	const rects = $derived(
		squarify(
			items.map((i) => i.value),
			{ x: 0, y: 0, w: width, h: height }
		)
	);
	const shown = $derived(measure === 'usage' ? card.used : card.allocated);
	const model = $derived(gpuModelName(card.model));

	// The hovered tile, and the pointer in viewport coordinates for the tooltip to trail.
	let hover = $state<string | undefined>();
	let pointer = $state({ x: 0, y: 0 });

	function tip(key: string): {
		title: string;
		subtitle?: string;
		lines: { k: string; v: string }[];
	} {
		const where = `${card.device} · ${model}`;
		if (key === 'outside') {
			return {
				title: m.analytics_outside_hami_title(),
				subtitle: where,
				lines: [
					{
						k: m.analytics_card_used(),
						v: m.analytics_x_of_y({ x: fmtGpuGiB(card.used), y: fmtGpuGiB(card.capacity) })
					},
					{ k: m.analytics_allocated(), v: m.analytics_by_hami({ x: fmtGpuGiB(card.allocated) }) },
					{
						k: m.analytics_untracked(),
						v: m.analytics_not_tied({ x: fmtGpuGiB(card.outside ?? 0) })
					}
				]
			};
		}
		if (key === 'unreported') {
			return {
				title: m.analytics_unreported_title(),
				subtitle: where,
				lines: [
					{
						k: m.analytics_card_used(),
						v: m.analytics_x_of_y({ x: fmtGpuGiB(card.used), y: fmtGpuGiB(card.capacity) })
					},
					{ k: m.analytics_tracked(), v: `${fmtGpuGiB(card.tracked)} GiB` },
					{ k: m.analytics_not_reporting(), v: card.unreported.join(', ') }
				]
			};
		}
		const pod = card.pods.find((p) => `${p.namespace}/${p.pod}` === key);
		if (!pod) return { title: key, lines: [] };
		// The card's device and model are in its heading; the pod's card count only when it spans several.
		const n = cardsOf(key);
		return {
			title: pod.pod,
			subtitle: pod.namespace,
			lines: [
				{
					k: m.analytics_this_card(),
					v: m.analytics_gpu_used_allocated({
						used: fmtGpuGiB(pod.tracked),
						allocated: fmtGpuGiB(pod.allocated)
					})
				},
				...(n > 1
					? [{ k: m.analytics_pod_total(), v: m.analytics_on_cards({ count: String(n) }) }]
					: [])
			]
		};
	}

	const HATCH_MUTED = 'repeating-linear-gradient(135deg, var(--muted) 0 2px, transparent 2px 8px)';
	const HATCH_RED =
		'repeating-linear-gradient(135deg, color-mix(in srgb, var(--destructive) 22%, var(--card)) 0 3px, color-mix(in srgb, var(--destructive) 8%, var(--card)) 3px 8px)';
</script>

<div class="min-w-0">
	<div class="flex items-baseline justify-between gap-2 pb-1.5">
		<span class="font-mono text-[0.8125rem] font-[550]">{card.device}</span>
		<span class="truncate font-mono text-xs text-muted-foreground tabular-nums">
			{fmtGpuGiB(shown)} / {fmtGpuGiB(card.capacity)} GiB
		</span>
	</div>
	<div
		class="relative w-full"
		style:height="{height}px"
		bind:clientWidth={width}
		role="presentation"
		onpointermove={(e) => (pointer = { x: e.clientX, y: e.clientY })}
		onpointerleave={() => (hover = undefined)}
	>
		{#if width > 0}
			{#each items as item, i (item.key)}
				{@const r = rects[i]}
				{@const color = item.kind === 'pod' ? groupOf(item.namespace).color : undefined}
				{#if r.w > 0 && r.h > 0}
					<div
						class={cn(
							'absolute flex flex-col overflow-hidden rounded-lg border-2 border-card bg-clip-padding px-2 py-1.5 font-mono text-[0.6875rem] leading-4',
							item.kind !== 'pod' && 'items-center justify-center text-center',
							(item.kind === 'free' || item.kind === 'unreported') &&
								'text-muted-foreground ring-1 ring-border ring-inset',
							item.kind === 'outside' && 'text-destructive'
						)}
						style:left="{r.x}px"
						style:top="{r.y}px"
						style:width="{r.w}px"
						style:height="{r.h}px"
						style:background={item.kind === 'pod'
							? `color-mix(in srgb, ${color} ${hover === item.key ? 40 : 24}%, var(--card))`
							: item.kind === 'outside'
								? HATCH_RED
								: HATCH_MUTED}
						style:box-shadow={item.kind === 'pod'
							? `inset 0 0 0 1px color-mix(in srgb, ${color} 55%, var(--card))`
							: item.kind === 'outside'
								? 'inset 0 0 0 1px color-mix(in srgb, var(--destructive) 60%, var(--card))'
								: undefined}
						role="presentation"
						onpointerenter={(e) => {
							hover = item.kind === 'free' ? undefined : item.key;
							pointer = { x: e.clientX, y: e.clientY };
						}}
						onpointerleave={() => (hover = undefined)}
					>
						{#if item.kind === 'pod'}
							{#if r.w > 70 && r.h > 30}
								<p class="truncate">{item.pod}</p>
								{#if r.h > 46}<p class="truncate text-muted-foreground">
										{fmtGpuGiB(item.value)} GiB
									</p>{/if}
							{/if}
						{:else if r.w > 70 && r.h > 40}
							<p class="font-sans font-[550]">
								{item.kind === 'outside'
									? m.analytics_outside_hami()
									: item.kind === 'unreported'
										? m.analytics_not_reported()
										: measure === 'usage'
											? m.analytics_free()
											: m.analytics_unallocated()}
							</p>
							<p class="tabular-nums">{fmtGpuGiB(item.value)} GiB</p>
						{/if}
					</div>
				{/if}
			{/each}
			{#if items.length === 0}
				<div
					class="absolute inset-0 rounded-lg ring-1 ring-border ring-inset"
					style:background={HATCH_MUTED}
				></div>
			{/if}
			{#if hover}
				{@const t = tip(hover)}
				<MapTooltip
					title={t.title}
					subtitle={t.subtitle}
					lines={t.lines}
					x={pointer.x}
					y={pointer.y}
				/>
			{/if}
		{/if}
	</div>
</div>

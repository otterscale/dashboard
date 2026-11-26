<script lang="ts">
	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { classifyThreshold, thresholdClasses } from '$lib/prometheus';
	import { cn } from '$lib/utils';

	import { NUM } from './index';
	import Status from './status.svelte';

	// Usage, request and limit as a share of allocatable. Requests and limits routinely pass
	// 100 %, which a ring cannot show, so the rows share one scale that stretches to the largest
	// value, with a tick at the allocatable amount and a hatched tail past it.
	let {
		rows,
		tickLabel = m.dashboard_allocatable(),
		thresholds = { green: 70, orange: 90 },
		summary = true,
		class: className
	}: {
		/** `hint` rides on the value as a tooltip: a related figure that does not earn its own row. */
		rows: { label: string; value: number | undefined; colored?: boolean; hint?: string }[];
		/** What 100 % stands for. */
		tickLabel?: string;
		/** Upper bounds of the healthy and warning bands, as `classifyThreshold` reads them. */
		thresholds?: { green: number; orange: number };
		/** The line under the bars naming the worst row. Off where the bar colours carry it alone. */
		summary?: boolean;
		class?: string;
	} = $props();

	const max = $derived(Math.max(100, ...rows.map((r) => Number(r.value ?? 0)).filter(isFinite)));
	const tick = $derived((100 / max) * 100);

	const worst = $derived.by(() => {
		const flagged = rows
			.filter((r) => r.colored !== false)
			.map((r) => ({ label: r.label, value: Number(r.value ?? 0) }))
			.filter((r) => r.value > 100 || level(r.value) === 'red')
			.sort((a, b) => b.value - a.value)[0];
		if (!flagged) return undefined;
		return {
			label: flagged.label,
			over: flagged.value > 100,
			tone: level(flagged.value) === 'red' ? ('bad' as const) : ('warn' as const)
		};
	});

	function level(value: number) {
		return classifyThreshold(value, thresholds);
	}
</script>

<div class={cn('grid gap-y-1', NUM, className)}>
	<div class="commit-row text-[11px] leading-4 text-muted-foreground" aria-hidden="true">
		<span></span>
		<span class="relative h-4">
			<span class="absolute -translate-x-1/2 whitespace-nowrap" style:left="{tick}%">
				{tickLabel}
			</span>
		</span>
		<span></span>
	</div>
	{#each rows as row (row.label)}
		{@const value = Number(row.value ?? 0)}
		{@const lv = level(value)}
		{@const tone = row.colored === false ? '' : thresholdClasses(lv).text}
		<div class="commit-row min-h-7 text-sm">
			<span class="truncate text-muted-foreground">{row.label}</span>
			<span class={cn('relative block h-1.5 rounded-full bg-muted', tone || 'text-chart-3')}>
				<span
					class={cn(
						'absolute inset-y-0 left-0 bg-chart-3',
						value > 100 ? 'rounded-l-full' : 'rounded-full'
					)}
					style:width="{(Math.min(value, 100) / max) * 100}%"
				></span>
				{#if value > 100}
					<span
						class="hatch absolute inset-y-0 rounded-r-full"
						style:left="{tick}%"
						style:width="{((value - 100) / max) * 100}%"
					></span>
				{/if}
				<span class="absolute -inset-y-1 w-px bg-foreground" style:left="{tick}%"></span>
			</span>
			{#if row.hint}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<span
								{...props}
								class={cn(
									'cursor-help text-right font-medium underline decoration-dotted underline-offset-4',
									tone
								)}
							>
								{Math.round(value)} %<span class="sr-only">, {row.hint}</span>
							</span>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{row.hint}</Tooltip.Content>
				</Tooltip.Root>
			{:else}
				<span class={cn('text-right font-medium', tone)}>{Math.round(value)} %</span>
			{/if}
		</div>
	{/each}
	<!-- The worst row, in words. Always one line tall, so the card never changes height. -->
	{#if summary}
		<p class="min-h-4 text-right leading-4">
			{#if worst}
				<Status tone={worst.tone} icon="alert">
					{worst.label}: {worst.over ? m.dashboard_overcommitted() : m.dashboard_near_capacity()}
				</Status>
			{/if}
		</p>
	{/if}
</div>

<style>
	.commit-row {
		display: grid;
		grid-template-columns: 4.5rem minmax(0, 1fr) 3.25rem;
		column-gap: 0.5rem;
		align-items: center;
	}
	.hatch {
		background: repeating-linear-gradient(135deg, currentColor 0 2px, transparent 2px 4px);
	}
</style>

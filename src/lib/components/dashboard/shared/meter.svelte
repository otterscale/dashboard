<script lang="ts">
	import type { Snippet } from 'svelte';

	import { Badge } from '$lib/components/shadcnio/badge';
	import { Progress } from '$lib/components/shadcnio/progress';
	import { m } from '$lib/messages';
	import { cn } from '$lib/utils';

	import { type Level, levelOf, levelText } from './status';

	// One labelled bar: a quantity against its bound.
	// - No bound (`unlimited`): no bar at all, a "No limit" badge. A bar would claim
	//   a proportion that does not exist.
	// - Over the bound: the bar is full and red, the true percentage is printed,
	//   and an "Over" badge says so in words. The bar never grows past its track.
	let {
		label,
		value,
		percent,
		unlimited = false,
		level,
		thresholds,
		swatch,
		class: className,
		labelExtra
	}: {
		label: string;
		/** The reading, already formatted, e.g. `32.30 / 128`. */
		value?: string;
		/** 0-100 and beyond; `null` when there is nothing to divide by. */
		percent: number | null;
		unlimited?: boolean;
		/** Overrides the level worked out from `percent`. */
		level?: Level;
		thresholds?: { warn: number; danger: number };
		/** A class for a small colour key before the label (a chart series colour). */
		swatch?: string;
		class?: string;
		labelExtra?: Snippet;
	} = $props();

	const over = $derived(percent !== null && percent > 100);
	const resolved = $derived<Level>(
		level ?? (percent === null ? 'neutral' : over ? 'danger' : levelOf(percent, thresholds))
	);
	const shown = $derived(
		percent === null ? '' : `${percent >= 100 ? percent.toFixed(0) : percent.toFixed(1)} %`
	);
	// Written out in full so Tailwind sees each class.
	const fill = $derived(
		{
			ok: '[&_[data-slot=progress-indicator]]:bg-primary',
			neutral: '[&_[data-slot=progress-indicator]]:bg-primary',
			warn: '[&_[data-slot=progress-indicator]]:bg-warning',
			danger: '[&_[data-slot=progress-indicator]]:bg-destructive'
		}[resolved]
	);
</script>

<div class={cn('grid min-w-0 gap-1.5', className)}>
	<div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
		<span class="flex min-w-0 items-center gap-1.5 text-sm font-medium">
			{#if swatch}
				<span class={cn('size-2 shrink-0 rounded-full', swatch)} aria-hidden="true"></span>
			{/if}
			<span class="truncate">{label}</span>
			{#if labelExtra}{@render labelExtra()}{/if}
		</span>
		<span class="ms-auto flex min-w-0 flex-wrap items-baseline justify-end gap-x-2">
			{#if value}
				<span class="font-mono text-xs text-muted-foreground tabular-nums">{value}</span>
			{/if}
			{#if unlimited}
				<Badge variant="outline" pill class="self-center">{m.dash_no_limit()}</Badge>
			{:else if percent !== null}
				<span class={cn('text-sm font-medium tabular-nums', levelText[resolved])}>{shown}</span>
				{#if over}
					<Badge variant="destructive" pill class="self-center">{m.dash_over()}</Badge>
				{/if}
			{/if}
		</span>
	</div>
	{#if unlimited}
		<p class="text-xs text-muted-foreground">{m.dash_no_limit_hint()}</p>
	{:else if percent !== null}
		<Progress
			aria-label={label}
			value={Math.max(0, percent)}
			class={cn(
				'[&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-track]]:h-1.5',
				fill
			)}
		/>
	{/if}
</div>

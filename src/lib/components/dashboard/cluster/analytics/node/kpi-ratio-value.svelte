<script lang="ts">
	import type { Component } from 'svelte';

	import type { LoadStatus } from '$lib/components/dashboard/shared/loadable.svelte';
	import { type Level, levelOf, levelText } from '$lib/components/dashboard/shared/status';
	import { Progress } from '$lib/components/shadcnio/progress';
	import { cn } from '$lib/utils';

	import KpiCard from '../kpi-card.svelte';

	// A ratio KPI: the percentage coloured by its threshold, a thin bar in the same level's
	// colour and the capacity reading under it. Shared by the CPU / RAM / Pods / FileSystem
	// tiles so they stay identical.
	let {
		title,
		description,
		tooltip,
		icon,
		status,
		stale = false,
		pct,
		subLine,
		decimals = 1
	}: {
		title: string;
		description: string;
		tooltip: string;
		icon: Component;
		status: LoadStatus;
		stale?: boolean;
		pct: number;
		subLine: string;
		decimals?: number;
	} = $props();

	const level = $derived(levelOf(pct));
	// Written out in full so Tailwind sees each class.
	const fill: Record<Level, string> = {
		ok: '[&_[data-slot=progress-indicator]]:bg-primary',
		neutral: '[&_[data-slot=progress-indicator]]:bg-primary',
		warn: '[&_[data-slot=progress-indicator]]:bg-warning',
		danger: '[&_[data-slot=progress-indicator]]:bg-destructive'
	};
</script>

<!-- The minimum height is the loaded tile's, so the skeleton, the empty state and the error
     state (which have no bar) do not change the row's height. -->
<KpiCard {title} {description} {tooltip} {icon} {status} {stale} class="min-h-34">
	<span class={levelText[level]}>{pct.toFixed(decimals)} %</span>
	{#snippet detail()}
		<div class="grid min-w-0 gap-1.5 pt-1">
			<Progress
				aria-label={title}
				value={Math.max(0, pct)}
				class={cn(
					'[&_[data-slot=progress-indicator]]:rounded-full [&_[data-slot=progress-track]]:h-1.5',
					fill[level]
				)}
			/>
			<span class="font-mono break-words tabular-nums">{subLine}</span>
		</div>
	{/snippet}
</KpiCard>

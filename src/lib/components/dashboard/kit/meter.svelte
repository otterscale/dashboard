<script lang="ts">
	import { cn } from '$lib/utils';

	// A thin proportion bar. `class` sets the text colour, which the fill follows.
	let {
		value,
		soft,
		mark,
		size = 'default',
		class: className
	}: {
		value: number | undefined;
		/** A second, fainter fill behind the first, e.g. a request behind the usage. */
		soft?: number;
		/** A tick across the bar at this percent, e.g. a threshold or a limit. */
		mark?: number;
		size?: 'default' | 'sm';
		class?: string;
	} = $props();

	const clamp = (v: number | undefined) => Math.min(100, Math.max(0, Number(v ?? 0)));
	const width = $derived(clamp(value));
</script>

<span
	class={cn(
		'relative block min-w-8 flex-1 rounded-full bg-muted text-chart-3',
		size === 'sm' ? 'h-[3px]' : 'h-1.5',
		className
	)}
	aria-hidden="true"
>
	{#if soft !== undefined}
		<span
			class="absolute inset-y-0 left-0 rounded-full bg-current opacity-28"
			style:width="{clamp(soft)}%"
		></span>
	{/if}
	<span class="absolute inset-y-0 left-0 rounded-full bg-current" style:width="{width}%"></span>
	{#if mark !== undefined}
		<span
			class="absolute -inset-y-0.75 -ml-px w-0.5 rounded-full bg-foreground"
			style:left="{clamp(mark)}%"
		></span>
	{/if}
</span>

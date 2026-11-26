<script lang="ts">
	import { cn } from '$lib/utils';

	// A thin proportion bar. `class` sets the text colour, which the fill follows.
	let {
		value,
		size = 'default',
		class: className
	}: { value: number | undefined; size?: 'default' | 'sm'; class?: string } = $props();

	const width = $derived(Math.min(100, Math.max(0, Number(value ?? 0))));
</script>

<span
	class={cn(
		'relative block min-w-8 flex-1 overflow-hidden rounded-full bg-muted text-chart-3',
		size === 'sm' ? 'h-[3px]' : 'h-1.5',
		className
	)}
	aria-hidden="true"
>
	<span class="absolute inset-y-0 left-0 rounded-full bg-current" style:width="{width}%"></span>
</span>

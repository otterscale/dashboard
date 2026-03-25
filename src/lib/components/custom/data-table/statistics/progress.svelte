<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		numerator,
		denominator,
		target = 'HTB',
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & {
		numerator: number;
		denominator: number;
		target?: 'HTB' | 'LTB';
	} = $props();

	const percentage = $derived(denominator > 0 ? (numerator / denominator) * 100 : 0);

	// HTB = Higher the Better (green if high), LTB = Lower the Better (red if high)
	const barColor = $derived(
		target === 'LTB'
			? percentage > 80
				? 'bg-destructive'
				: percentage > 60
					? 'bg-yellow-500'
					: 'bg-primary'
			: percentage > 80
				? 'bg-primary'
				: percentage > 60
					? 'bg-yellow-500'
					: 'bg-destructive'
	);
</script>

<div
	data-slot="data-table-statistics-progress"
	class={cn('absolute right-0 bottom-0 left-0 h-1 bg-muted', className)}
	{...restProps}
>
	<div
		class={cn('h-full transition-all duration-500', barColor)}
		style="width: {percentage}%"
	></div>
</div>

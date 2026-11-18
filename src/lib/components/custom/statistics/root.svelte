<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';

	let {
		type,
		class: className,
		children,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { type: 'count' | 'ratio' } = $props();
</script>

<div
	data-slot="data-table-statistics-root"
	data-type={type}
	class={cn(
		'relative flex flex-col gap-3 overflow-hidden rounded-xl bg-card p-4 ring-1 ring-foreground/10',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

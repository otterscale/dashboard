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
		'relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-6 shadow-sm',
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>

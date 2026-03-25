<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	data-slot="data-table-statistics-title"
	class={cn('text-sm font-medium text-muted-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</div>

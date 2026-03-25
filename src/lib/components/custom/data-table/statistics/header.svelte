<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	data-slot="data-table-statistics-header"
	class={cn('flex flex-col gap-1', className)}
	{...restProps}
>
	{@render children?.()}
</div>

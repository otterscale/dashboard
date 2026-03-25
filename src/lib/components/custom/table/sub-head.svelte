<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';

	let { class: className, children, ...restProps }: HTMLAttributes<HTMLTableCellElement> = $props();
</script>

<th class={cn('px-2 py-1 text-xs font-semibold text-muted-foreground', className)} {...restProps}>
	{@render children?.()}
</th>

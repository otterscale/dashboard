<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';
	let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	class={cn('font-heading text-sm font-medium tracking-tight', className)}
	data-slot="empty-title"
	{...rest}
>
	{@render children?.()}
</div>

<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { VariantProps } from 'tailwind-variants';

	import { cn } from '$lib/utils';

	import { emptyMediaVariants } from './shared';
	let {
		class: className,
		variant = 'default',
		children,
		...rest
	}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof emptyMediaVariants> = $props();
</script>

<div
	class={cn(emptyMediaVariants({ variant }), className)}
	data-slot="empty-icon"
	data-variant={variant}
	{...rest}
>
	{@render children?.()}
</div>

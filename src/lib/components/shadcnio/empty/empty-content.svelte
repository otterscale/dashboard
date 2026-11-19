<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';
	let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	class={cn(
		'flex w-full max-w-sm min-w-0 flex-col items-center gap-2.5 text-sm text-balance',
		className
	)}
	data-slot="empty-content"
	{...rest}
>
	{@render children?.()}
</div>

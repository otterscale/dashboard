<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';
	let { class: className, children, ...rest }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div
	class={cn('flex max-w-sm flex-col items-center gap-2', className)}
	data-slot="empty-header"
	{...rest}
>
	{@render children?.()}
</div>

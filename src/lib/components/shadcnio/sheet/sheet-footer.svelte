<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';

	import { cn } from '$lib/utils';
	let { class: className, children, ...props }: HTMLAttributes<HTMLDivElement> = $props();
</script>

<div class={cn('mt-auto flex flex-col gap-2 p-4', className)} data-slot="sheet-footer" {...props}>
	{@render children?.()}
</div>

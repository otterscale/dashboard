<script lang="ts">
	import Icon from '@iconify/svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn } from '$lib/utils';

	let {
		icon,
		class: className,
		...restProps
	}: HTMLAttributes<HTMLDivElement> & { icon: string } = $props();
</script>

<div
	data-slot="data-table-statistics-background"
	class={cn('pointer-events-none absolute right-2 bottom-2 text-muted-foreground/10', className)}
	{...restProps}
>
	<Icon {icon} class="size-24" />
</div>

<script lang="ts">
	import { getContext } from 'svelte';

	import { cn } from '$lib/utils';

	import type { SelectOption } from './root.svelte';

	let {
		option,
		class: className,
		children,
		...restProps
	}: {
		option: SelectOption;
		class?: string;
		children?: import('svelte').Snippet;
		[key: string]: unknown;
	} = $props();

	const ctx = getContext<{
		getValue: () => string | undefined;
		setValue: (v: string) => void;
	}>('single-select');
</script>

<button
	type="button"
	role="option"
	aria-selected={ctx.getValue() === option.value}
	class={cn(
		'relative flex w-full cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none select-none',
		'hover:bg-accent hover:text-accent-foreground',
		ctx.getValue() === option.value && 'bg-accent/50',
		className
	)}
	onclick={() => ctx.setValue(option.value)}
	{...restProps}
>
	{@render children?.()}
</button>

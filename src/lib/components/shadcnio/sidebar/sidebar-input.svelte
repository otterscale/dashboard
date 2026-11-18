<script lang="ts">
	import type { ComponentProps } from 'svelte';

	import { Input } from '$lib/components/shadcnio/input/index.js';
	import { cn } from '$lib/utils';
	let { class: className, ref = $bindable(null), ...rest }: ComponentProps<typeof Input> = $props();
</script>

<Input
	class={cn('h-8 w-full bg-background shadow-none', className)}
	data-sidebar="input"
	data-slot="sidebar-input"
	{...rest}
	bind:ref
/>

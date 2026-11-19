<script lang="ts">
	import { Avatar as ArkAvatar } from '@ark-ui/svelte/avatar';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		size = 'default',
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkAvatar.RootProvider> & {
		size?: 'default' | 'sm' | 'lg';
	} = $props();
</script>

<ArkAvatar.RootProvider
	class={cn(
		'group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten',
		className
	)}
	data-size={size}
	data-slot="avatar"
	{...rest}
	bind:ref
/>

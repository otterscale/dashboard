<script lang="ts">
	import { Avatar as ArkAvatar } from '@ark-ui/svelte/avatar';

	import { cn } from '$lib/utils';

	import type { AvatarProps } from './shared';
	let {
		size = 'default',
		class: className,
		ref = $bindable(null),
		...rest
	}: AvatarProps = $props();
</script>

<ArkAvatar.Root
	class={cn(
		'group/avatar relative flex size-8 shrink-0 rounded-full select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:after:mix-blend-lighten',
		className
	)}
	data-size={size}
	data-slot="avatar"
	{...rest}
	bind:ref
/>

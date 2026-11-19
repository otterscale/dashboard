<script lang="ts">
	import { Avatar as ArkAvatar } from '@ark-ui/svelte/avatar';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkAvatar.Image> = $props();
</script>

<ArkAvatar.Image
	class={cn(
		'aspect-square size-full rounded-full object-cover data-[state=hidden]:invisible data-[state=hidden]:absolute data-[state=hidden]:inset-0',
		className
	)}
	data-slot="avatar-image"
	hidden={false}
	{...rest}
	bind:ref
/>

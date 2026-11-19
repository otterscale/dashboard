<script lang="ts">
	import { Avatar as ArkAvatar } from '@ark-ui/svelte/avatar';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		class: className,
		ref = $bindable(null),
		...rest
	}: ComponentProps<typeof ArkAvatar.Fallback> = $props();
</script>

<ArkAvatar.Fallback
	class={cn(
		'flex size-full items-center justify-center rounded-full bg-muted text-sm text-muted-foreground group-data-[size=sm]/avatar:text-xs',
		className
	)}
	data-slot="avatar-fallback"
	{...rest}
	bind:ref
/>

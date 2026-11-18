<script lang="ts">
	import type { IconProps } from '@lucide/svelte';
	import Loader2Icon from '@lucide/svelte/icons/loader-circle';

	import { cn } from '$lib/utils';
	let { 'aria-label': ariaLabel, class: className, ...rest }: IconProps = $props();
</script>

<Loader2Icon
	aria-label={ariaLabel ?? 'Loading'}
	class={cn('size-4 animate-spin motion-reduce:animate-none', className)}
	data-slot="spinner"
	role="status"
	{...rest}
/>

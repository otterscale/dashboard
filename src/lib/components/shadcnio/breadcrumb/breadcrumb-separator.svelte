<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';
	import ChevronRightIcon from '@lucide/svelte/icons/chevron-right';
	import type { ComponentProps } from 'svelte';

	import { cn } from '$lib/utils';
	let {
		children,
		class: className,
		ref = $bindable(null),
		...rest
	}: Omit<ComponentProps<typeof Ark<'li'>>, 'as'> = $props();
</script>

<Ark
	as="li"
	aria-hidden="true"
	class={cn('[&>svg]:size-3.5', className)}
	data-slot="breadcrumb-separator"
	role="presentation"
	{...rest}
	bind:ref
	>{#if children}{@render children?.()}{:else}<ChevronRightIcon
			class="cn-rtl-flip rtl:rotate-180"
		/>{/if}</Ark
>

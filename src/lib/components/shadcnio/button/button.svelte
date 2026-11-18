<script lang="ts">
	import { Ark } from '@ark-ui/svelte/factory';

	import { Spinner } from '$lib/components/shadcnio/spinner/index.js';
	import { cn } from '$lib/utils';

	import { type ButtonProps, buttonVariants } from './shared';
	let {
		variant = 'default',
		size = 'md',
		clickEffect = true,
		pill = false,
		isLoading = false,
		asChild,
		type = 'button',
		disabled = false,
		class: className,
		children,
		ref = $bindable(null),
		...rest
	}: ButtonProps = $props();
</script>

<Ark
	as="button"
	{asChild}
	class={cn(buttonVariants({ clickEffect, pill, size, variant }), className)}
	data-pill={pill || undefined}
	data-size={size}
	data-slot="button"
	data-state={isLoading ? 'loading' : 'idle'}
	data-variant={variant}
	disabled={disabled || isLoading}
	type={asChild ? undefined : type}
	{...rest}
	bind:ref
	aria-busy={isLoading || undefined}
	>{#if asChild || !isLoading}{@render children?.()}{:else}<span
			aria-hidden="true"
			class="invisible">{@render children?.()}</span
		><span class="sr-only">{@render children?.()}</span><span
			class="absolute inset-0 flex items-center justify-center"><Spinner aria-hidden="true" /></span
		>{/if}</Ark
>

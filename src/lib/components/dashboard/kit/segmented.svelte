<script lang="ts" generics="T extends string">
	import { cn } from '$lib/utils';

	// A row of toggle buttons, one pressed. Buttons rather than tabs: each one only changes what
	// the card next to it shows, it does not swap a panel.
	let {
		options,
		value = $bindable(),
		label,
		size = 'default',
		class: className
	}: {
		options: { value: T; label: string }[];
		value: T;
		label: string;
		/** `xs` sits in a card's title row, beside the info button. */
		size?: 'default' | 'sm' | 'xs';
		class?: string;
	} = $props();
</script>

<div
	role="group"
	aria-label={label}
	class={cn(
		'inline-flex w-fit shrink-0 items-center rounded-full bg-muted p-[3px]',
		size === 'xs' ? 'h-7 p-0.5' : size === 'sm' ? 'h-8' : 'h-9',
		className
	)}
>
	{#each options as option (option.value)}
		<button
			type="button"
			aria-pressed={value === option.value}
			onclick={() => (value = option.value)}
			class={cn(
				'inline-flex h-full items-center rounded-full font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-pressed:bg-card aria-pressed:text-foreground aria-pressed:shadow-sm',
				size === 'xs' ? 'px-2 text-xs' : size === 'sm' ? 'px-3 text-[0.8125rem]' : 'px-3 text-sm'
			)}
		>
			{option.label}
		</button>
	{/each}
</div>

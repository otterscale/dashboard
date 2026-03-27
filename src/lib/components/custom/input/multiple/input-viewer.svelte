<script lang="ts" module>
	import BoxIcon from '@lucide/svelte/icons/box';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import type { WithElementRef } from 'bits-ui';
	import { getContext } from 'svelte';
	import type { HTMLAnchorAttributes } from 'svelte/elements';

	import { Badge, type BadgeVariant } from '$lib/components/ui/badge';
	import Button from '$lib/components/ui/button/button.svelte';
	import { cn } from '$lib/utils';

	import { InputManager, ValuesManager } from './utils.svelte';
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		href,
		class: className,
		variant = 'outline',
		disabled,
		...restProps
	}: WithElementRef<HTMLAnchorAttributes> & {
		variant?: BadgeVariant;
		disabled?: boolean;
	} = $props();

	const inputManager: InputManager = getContext('InputManager');
	const valuesManager: ValuesManager = getContext('ValuesManager');
</script>

{#if valuesManager.values.length > 0}
	<div class="flex flex-wrap gap-1">
		{#each valuesManager.values as value (value)}
			{#if !(value == undefined || value == null)}
				{@const ItemIcon = inputManager.icon ?? BoxIcon}
				<Badge
					{href}
					bind:ref
					data-slot="input-viewer"
					class={cn('flex h-6 items-center gap-3', className)}
					{...restProps}
					{variant}
				>
					<span class="flex items-center gap-1">
						<ItemIcon class="size-4" />
						{value}
					</span>
					<Button
						class={cn('size-3 cursor-pointer', disabled ? 'hidden' : 'visible')}
						aria-label="Remove"
						size="icon"
						variant="ghost"
						{disabled}
						onclick={() => {
							valuesManager.remove(value);
						}}
					>
						<CircleXIcon class="size-4 text-muted-foreground" />
					</Button>
				</Badge>
			{/if}
		{/each}
	</div>
{/if}

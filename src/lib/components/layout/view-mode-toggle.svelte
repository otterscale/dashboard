<script lang="ts">
	import SlidersHorizontalIcon from '@lucide/svelte/icons/sliders-horizontal';
	import SparklesIcon from '@lucide/svelte/icons/sparkles';

	import * as Tooltip from '$lib/components/ui/tooltip';
	import { m } from '$lib/messages';
	import { type ViewMode, viewMode } from '$lib/stores';
	import { cn } from '$lib/utils';

	const options = [
		{
			value: 'simple',
			label: m.view_mode_simple,
			description: m.view_mode_simple_description,
			icon: SparklesIcon
		},
		{
			value: 'advanced',
			label: m.view_mode_advanced,
			description: m.view_mode_advanced_description,
			icon: SlidersHorizontalIcon
		}
	] as const satisfies {
		value: ViewMode;
		label: () => string;
		description: () => string;
		icon: unknown;
	}[];

	const activeIndex = $derived(options.findIndex((option) => option.value === $viewMode));
</script>

<!-- A segmented control: the thumb slides under the active option rather than snapping. -->
<div
	role="radiogroup"
	aria-label={m.view_mode()}
	class="relative grid h-7 grid-cols-2 rounded-md bg-muted p-0.5 text-xs font-medium"
>
	<span
		aria-hidden="true"
		class="absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] bg-background shadow-sm transition-transform duration-(--duration-base) ease-(--ease-smooth)"
		style:transform={`translateX(${Math.max(activeIndex, 0) * 100}%)`}
	></span>
	{#each options as option (option.value)}
		{@const selected = $viewMode === option.value}
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<button
						{...props}
						type="button"
						role="radio"
						aria-checked={selected}
						class={cn(
							'relative z-10 flex items-center justify-center gap-1.5 rounded-[5px] px-2.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
							selected ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
						)}
						onclick={() => viewMode.set(option.value)}
					>
						<option.icon class="size-3.5" aria-hidden="true" />
						{option.label()}
					</button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>{option.description()}</Tooltip.Content>
		</Tooltip.Root>
	{/each}
</div>

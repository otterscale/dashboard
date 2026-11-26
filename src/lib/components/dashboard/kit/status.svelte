<script lang="ts">
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import CircleXIcon from '@lucide/svelte/icons/circle-x';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	import { type Tone, TONE_DOT, TONE_PILL, TONE_TEXT } from './tone';

	// A status is always a mark and a word; the colour only repeats what they say.
	let {
		tone,
		icon,
		variant = 'icon',
		class: className,
		children
	}: {
		tone: Tone;
		/** `alert` for a level that is past a threshold, `x` for something that failed. */
		icon?: 'alert' | 'x';
		/**
		 * The mark: `icon` (check, triangle, cross), `dot` (a dot before the word, for table cells),
		 * or `pill` (the dot and word on a tinted chip, beside a headline number).
		 */
		variant?: 'icon' | 'dot' | 'pill';
		class?: string;
		children: Snippet;
	} = $props();
</script>

<span
	class={cn(
		'inline-flex items-center text-xs whitespace-nowrap',
		variant === 'icon' ? 'gap-1' : 'gap-1.5',
		variant === 'pill' && 'h-5 rounded-full px-2 leading-4',
		variant === 'pill' && TONE_PILL[tone],
		TONE_TEXT[tone],
		className
	)}
>
	{#if variant !== 'icon'}
		<!-- One line tall, so the dot sits on the first line of a wrapped status; it grows with the
		     text, from 6px at text-xs to 8px beside a headline number. -->
		<span class="inline-flex h-[1lh] shrink-0 items-center" aria-hidden="true">
			<span class={cn('size-[max(0.375rem,0.33em)] rounded-full', TONE_DOT[tone])}></span>
		</span>
	{:else if tone === 'ok'}
		<CircleCheckIcon class="size-3.5 shrink-0" aria-hidden="true" />
	{:else if tone === 'warn' || icon === 'alert'}
		<TriangleAlertIcon class="size-3.5 shrink-0" aria-hidden="true" />
	{:else}
		<CircleXIcon class="size-3.5 shrink-0" aria-hidden="true" />
	{/if}
	{@render children()}
</span>

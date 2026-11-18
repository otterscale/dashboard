<script lang="ts">
	import { Progress } from '$lib/components/shadcnio/progress';
	import { cn } from '$lib/utils';

	import type { Tone } from './tone';

	let {
		value,
		label,
		tone = 'primary',
		class: className
	}: {
		/** 0 to 100. */
		value: number;
		/** What the bar measures, for screen readers. */
		label: string;
		tone?: Tone;
		class?: string;
	} = $props();

	// Spelled out so Tailwind sees each class.
	const fill: Record<Tone, string> = {
		default: '**:data-[slot=progress-indicator]:bg-foreground',
		primary: '**:data-[slot=progress-indicator]:bg-primary',
		success: '**:data-[slot=progress-indicator]:bg-success',
		warning: '**:data-[slot=progress-indicator]:bg-warning',
		destructive: '**:data-[slot=progress-indicator]:bg-destructive',
		muted: '**:data-[slot=progress-indicator]:bg-muted-foreground/40'
	};
</script>

<Progress
	aria-label={label}
	value={Number.isFinite(value) ? value : 0}
	max={100}
	class={cn('**:data-[slot=progress-track]:h-1.5', fill[tone], className)}
/>

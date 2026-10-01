<script lang="ts" module>
	import type { StatusTone } from '$lib/components/dynamic-table/status';

	// Color carries the meaning at a glance; the label is always there too,
	// so nothing depends on telling hues apart.
	const DOT_CLASSES = {
		healthy: 'bg-success',
		progressing: 'bg-warning animate-pulse',
		degraded: 'bg-warning',
		failed: 'bg-destructive',
		stopped: 'bg-muted-foreground/50',
		unknown: 'bg-muted-foreground/30'
	} as const satisfies Record<StatusTone, string>;
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	import { cn } from '$lib/utils';

	let {
		tone,
		class: className,
		children
	}: {
		tone: StatusTone;
		class?: string;
		children: Snippet;
	} = $props();
</script>

<span
	class={cn(
		'inline-flex max-w-full items-center gap-1.5 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-foreground',
		className
	)}
>
	<span class={cn('size-1.5 shrink-0 rounded-full', DOT_CLASSES[tone])} aria-hidden="true"></span>
	<span class="truncate">{@render children()}</span>
</span>

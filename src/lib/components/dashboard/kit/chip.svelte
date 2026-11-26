<script lang="ts">
	import type { Snippet } from 'svelte';

	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';

	// A quiet label beside a name or a title: a role, a count, a kind. For a status use `Status`.
	let { class: className, children }: { class?: string; children: Snippet } = $props();
</script>

<Badge
	variant="secondary"
	class={cn('border-0 bg-muted font-normal text-muted-foreground', className)}
>
	{@render children()}
</Badge>

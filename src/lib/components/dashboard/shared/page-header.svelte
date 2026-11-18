<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		actions
	}: {
		title: string;
		description?: string;
		/** Controls that act on the whole page: time range, auto update. */
		actions?: Snippet;
	} = $props();
</script>

<div class="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
	<div class="min-w-0 space-y-1">
		<h1 class="text-2xl leading-tight font-semibold tracking-tight">{title}</h1>
		{#if description}
			<p class="max-w-3xl text-sm text-muted-foreground">{description}</p>
		{/if}
	</div>
	{#if actions}
		<div class="flex flex-wrap items-center gap-x-3 gap-y-2">
			{@render actions()}
		</div>
	{/if}
</div>

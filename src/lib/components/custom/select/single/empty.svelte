<script lang="ts">
	let { children }: { children?: import('svelte').Snippet } = $props();
</script>

<div class="px-2 py-4 text-center text-sm text-muted-foreground">
	{@render children?.()}
</div>

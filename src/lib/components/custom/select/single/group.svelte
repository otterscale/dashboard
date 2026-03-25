<script lang="ts">
	let { children }: { children?: import('svelte').Snippet } = $props();
</script>

<div class="overflow-hidden p-1">
	{@render children?.()}
</div>

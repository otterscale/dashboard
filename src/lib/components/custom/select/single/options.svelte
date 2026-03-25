<script lang="ts">
	let { children }: { children?: import('svelte').Snippet } = $props();
</script>

<div class="flex flex-col">
	{@render children?.()}
</div>

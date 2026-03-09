<script lang="ts">
	let {
		container = $bindable(),
		class: className
	}: {
		container: HTMLDivElement;
		class?: string;
	} = $props();
</script>

<div bind:this={container} class={className}></div>

<script lang="ts">
	let {
		cluster,
		schema,
		object,
		onOpenChangeComplete
	}: {
		cluster: unknown;
		schema: unknown;
		object: unknown;
		onOpenChangeComplete: unknown;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void schema;
	// svelte-ignore state_referenced_locally
	void object;
	// svelte-ignore state_referenced_locally
	void onOpenChangeComplete;
</script>

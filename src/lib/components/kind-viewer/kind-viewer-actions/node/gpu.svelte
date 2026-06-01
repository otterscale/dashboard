<script lang="ts">
	let {
		cluster,
		group,
		version,
		kind,
		resource,
		object
	}: {
		cluster: unknown;
		group: unknown;
		version: unknown;
		kind: unknown;
		resource: unknown;
		object: unknown;
	} = $props();

	// svelte-ignore state_referenced_locally
	void cluster;
	// svelte-ignore state_referenced_locally
	void group;
	// svelte-ignore state_referenced_locally
	void version;
	// svelte-ignore state_referenced_locally
	void kind;
	// svelte-ignore state_referenced_locally
	void resource;
	// svelte-ignore state_referenced_locally
	void object;
</script>
